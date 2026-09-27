import {
    computed,
    defineComponent,
    onBeforeUnmount,
    ref,
    useTemplateRef,
    watch,
    type PropType,
} from "vue";
import { useBrowserHistory } from "../browser-history";

type Props = {
    address?: string;
    routeForInputAddress: (address: string) => string;
    modelValue: boolean;
};

type Emit = {
    (event: "navigate", address: string): void;
    (event: "focus"): void;
    (event: "update:modelValue", value: boolean): void;
};

function setupAddressBar(props: Props, { emit }: { emit: Emit }) {
    const isDropdownOpen = computed({
        get: () => props.modelValue,
        set: (value: boolean) => emit("update:modelValue", value),
    });
    const siteAddress = computed(() => props.address);
    // Partially couple the input address to the route address
    // When the route changes, the input changes
    const addressInput = ref(siteAddress.value);
    watch(
        siteAddress,
        (newVal) => {
            addressInput.value = newVal;
            isDropdownOpen.value = false;
        },
        { immediate: true },
    );
    const {
        enabled: historyEnabled,
        suggestions: historySuggestions,
        enable: enableBrowserHistory,
    } = useBrowserHistory(siteAddress, addressInput);

    function navigateToInputAddress() {
        emit("navigate", addressInput.value || "Social.Wiki");
        exitAddressBar();
    }

    function onAddressFocusIn(event: FocusEvent) {
        emit("focus");

        if (
            event.target instanceof HTMLInputElement &&
            event.target.type === "text"
        ) {
            isDropdownOpen.value = true;
        }
    }
    const addressSearch = useTemplateRef<HTMLFormElement>("address-search");
    function onAddressFocusOut(event: FocusEvent) {
        const searchEl = addressSearch.value;
        const nextFocusedEl = event.relatedTarget;
        if (
            !searchEl ||
            !(nextFocusedEl instanceof Node && searchEl.contains(nextFocusedEl))
        ) {
            isDropdownOpen.value = false;
        }
    }

    const addressInputEl = useTemplateRef<HTMLInputElement>("address-input");
    const addressDropdownEl = useTemplateRef<HTMLUListElement>("address-dropdown");

    function listDropdownOptions() {
        const dropdown = addressDropdownEl.value;
        if (!dropdown) return [];

        return Array.from(dropdown.querySelectorAll<HTMLElement>("a, button"));
    }

    function blurActiveElement() {
        (document.activeElement as HTMLElement | null)?.blur();
    }

    function exitAddressBar() {
        isDropdownOpen.value = false;
        blurActiveElement();
    }

    function onAddressInputKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            exitAddressBar();
            return;
        }

        if (!isDropdownOpen.value) return;

        const options = listDropdownOptions();
        if (options.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            options[0].focus();
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            options[options.length - 1].focus();
        }
    }

    function onDropdownKeydown(event: KeyboardEvent) {
        if (!(event.target instanceof HTMLElement)) return;

        const option = event.target.closest("a, button");
        if (!(option instanceof HTMLElement)) return;

        const options = listDropdownOptions();
        const currentIndex = options.indexOf(option);
        if (currentIndex === -1) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            const nextIndex = (currentIndex + 1) % options.length;
            options[nextIndex].focus();
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (currentIndex === 0) {
                addressInputEl.value?.focus();
                return;
            }
            options[currentIndex - 1].focus();
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            exitAddressBar();
        }
    }

    const addressFocused = ref(false);
    let stopSelecting = () => { };
    onBeforeUnmount(() => stopSelecting());

    function selectAddressOnFocus(event: FocusEvent) {
        // Keyboard focus selects all too. Mousedown has already marked pointer
        // focus below, so an intentional drag is left to the browser.
        if (addressFocused.value) return;
        addressFocused.value = true;
        (event.target as HTMLInputElement).select();
    }
    function selectAddress(event: MouseEvent) {
        // If the user is already interacting with the address bar,
        // do not interfere with native browser selection
        if (addressFocused.value || event.button !== 0) return;
        addressFocused.value = true;
        stopSelecting();

        const input = event.target as HTMLInputElement;

        // If there is an existing selection, remove it.
        // This allows the creation of a new selection
        if (input.selectionStart !== null && input.selectionEnd !== null) {
            if (input.selectionStart !== input.selectionEnd) {
                input.setSelectionRange(input.selectionEnd, input.selectionEnd);
            }
        }

        // Ignore small pointer jitter, but preserve deliberate drag selection.
        let moved = false;
        const onMouseMove = (next: MouseEvent) => {
            moved ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) > 5;
        };
        const onMouseUp = () => {
            stopSelecting();
            if (!moved) {
                input.select();
            }
        };
        stopSelecting = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp, { once: true });
    }

    return {
        addressFocused,
        addressInput,
        enableBrowserHistory,
        historyEnabled,
        historySuggestions,
        isDropdownOpen,
        navigateToInputAddress,
        onAddressFocusIn,
        onAddressFocusOut,
        onAddressInputKeydown,
        onDropdownKeydown,
        routeForInputAddress: props.routeForInputAddress,
        selectAddress,
        selectAddressOnFocus,
        siteAddress,
    };
}

export default defineComponent({
    template: "#address-bar-template",
    props: {
        address: String,
        routeForInputAddress: { type: Function as PropType<Props["routeForInputAddress"]>, required: true },
        modelValue: { type: Boolean, required: true },
    },
    emits: ["navigate", "focus", "update:modelValue"],
    setup: setupAddressBar,
});
