## What changed

Describe the change and the claim, experiment, page, or workflow it affects.

## Evidence

- Claim ID and artifact path (if a number changed):
- Command run:
- Result:

## Checklist

- [ ] The change is focused and does not include unrelated refactors.
- [ ] `make test` passes.
- [ ] `make lint` passes.
- [ ] `make verify` passes (or the reason it cannot run is stated).
- [ ] Regenerated `README.md`, figures, `results/`, and `demo/data.js` are
      included when the change affects generated files.
- [ ] No secrets, credentials, dataset files, or local paths are committed.
- [ ] The console still loads at `preview.html` and `demo/app.html`.
