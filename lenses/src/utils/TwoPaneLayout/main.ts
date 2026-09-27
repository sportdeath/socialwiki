import { defineComponent, onBeforeUnmount, ref } from "vue";

type PaneSide = "left" | "right";

function setupTwoPaneLayout(props: { initialLeftWidth?: number }) {
  const activePane = ref<PaneSide>("left");
  const containerRef = ref<HTMLElement | null>(null);
  const leftWidth = ref(props.initialLeftWidth ?? 55);
  const isResizing = ref(false);

  function setActive(side: PaneSide) {
    activePane.value = side;
  }

  function onResize(event: MouseEvent) {
    // If mouseup was missed, stop when no button is pressed.
    if (event.buttons === 0) {
      stopResize();
      return;
    }
    if (!isResizing.value || !containerRef.value) return;

    const rect = containerRef.value.getBoundingClientRect();
    const percentage = ((event.clientX - rect.left) / rect.width) * 100;
    leftWidth.value = Math.min(80, Math.max(20, percentage));
  }

  function stopResize() {
    if (!isResizing.value) return;
    isResizing.value = false;
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", stopResize);
    window.removeEventListener("mouseleave", stopResize);
  }

  function startResize(event: MouseEvent) {
    event.preventDefault();
    if (isResizing.value) return;
    isResizing.value = true;
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseleave", stopResize);
  }

  onBeforeUnmount(stopResize);
  return { activePane, containerRef, leftWidth, isResizing, setActive, startResize };
}

export default defineComponent({
  template: "#two-pane-layout-template",
  props: {
    leftTitle: { type: String, required: true },
    rightTitle: { type: String, required: true },
    initialLeftWidth: Number,
  },
  setup: setupTwoPaneLayout,
});
