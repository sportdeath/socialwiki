# Social.Wiki

Social.Wiki is a reimagining of the web where all sites can be collaboratively edited like Wikipedia articles. Social.Wiki can be used to create a variety of interactive social sites including those for [microblogging](https://social.wiki/#/v?/stanza), [messaging](https://social.wiki/#/v?/pinkcord), [ridesharing](https://social.wiki/#/v?/rideshare), [playing games](https://social.wiki/#/v?/pixelart), and much more.

For more information and basic usage, see the [Social.Wiki homepage](https://social.wiki) or check out our academic paper describing Social.Wiki, [published in UIST'26](https://arxiv.org/abs/2608.19433).
What follows describes Social.Wiki's implementation and developement.

## Project Structure

This repository is divided into two main subfolders: [kernel](./kernel/) and [lenses](./lenses/).

The **kernel** provides a minimal set of abstract primitives that Social.Wiki is built out of,
most importantly the ability to securely "transclude" one HTML document within another,
the ability for those transcluded documents to access [Graffiti](https://github.com/graffiti-garden/graffiti), a social database and identity system.

The **lenses** are a series of documents that build upon the Social.Wiki kernel to create a browser-like experience.
These lenses include the top-level [browser](./lenses/src/browser),
and documents for its three tabs: [view](./lenses/src/view), [edit](./lenses/src/edit), and
[history](./lenses/src/history).
All of these lenses can be modified within Social.Wiki itself, changing the browser UI or changing
how collaborative editing of pages is governed.

To function properly, all Social.Wiki documents must include the kernel via a line like this at the top of their document:

```html
<script src="https://social.wiki/init.js"></script>
```

## Development

To develop locally:

```bash
cd socialwiki
npm install
npm run dev
```

Then open <http://localhost:5173> in your browser where you will see the Social.Wiki browser.

Building will automatically happen when you push changes to GitHub, but you can also build locally with:

```bash
npm run build
```

## How to Cite

To cite Social.Wiki, you can use the following BibTeX:

```bibtex
@inproceedings{socialwiki,
  title={{Social.Wiki}: A Web Held in Common},
  author={Henderson, Theia and Schare, Carmel and Dodik, Ana and Klokmose, Clemens N. and Epstein, Ziv and Clark, David D. and Karger, David R.},
  booktitle={Proceedings of the 39th Annual ACM Symposium on User Interface Software and Technology},
  pages={1--13},
  year={2026},
  month={11},
  url={https://doi.org/10.1145/3830398.3830639},
  DOI={10.1145/3830398.3830639},
  publisher={ACM},
  series={UIST ’26},
  collection={UIST ’26}
}
```
