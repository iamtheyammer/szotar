# szotar

English-Hungarian dictionary powered by Wiktionary with a WordReference-style interface

Try it: https://szotar.yammer.me (optionally add `?huen=<word>` or `?enhu=word` to jump straight in)!

Add it to your iOS Home Screen (Share → Add to Home Screen) and it installs as **Szótár**
with its own icon.

## Icons

The favicons and Home Screen icons in `docs/` are generated — edit `tools/make-icons.js`
and re-run it rather than editing the PNGs by hand:

```sh
node tools/make-icons.js   # needs Node 18+ and a Chromium/Chrome binary
```
