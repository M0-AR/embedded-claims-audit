# Contributing

Thanks for helping make engineering claims easier to check. This repository is
small on purpose: one claim registry, one artifact format, one verification
command. Please keep changes inside that shape.

## Ways to contribute

- **Challenge a claim.** Open a claim-challenge issue with the claim ID, the
  value you expected, and the artifact path or calculation that supports your
  reading.
- **Fix an experiment.** Bug reports with a failing test or a reproducible
  command are the fastest to act on.
- **Improve the console or the paper.** Accessibility, clarity, and
  reproducibility improvements are welcome.
- **Add a source.** If a claim needs a better datasheet or a more precise
  operating point, include the link and the relevant table or section.

## Ground rules

1. **One number, one path.** Every number that appears in the paper or the
   console must resolve from `results/results.json` or
   `results/verification.json`. Do not type a result into prose.
2. **State the operating point.** A claim without its denominator, convention,
   operating point, and hidden load is not ready for the registry.
3. **Preserve verdict semantics.** `supported` means the claim holds as stated;
   `qualified` means it holds only under an omitted condition; `refuted` means
   it does not hold under the conditions the source implies.
4. **Do not commit the dataset.** `data/raw/measures_v2.csv` is not
   redistributed. Keep it out of commits and releases.
5. **Generated files are generated.** Edit `paper/paper.md.j2`, not
   `README.md`; edit the experiment modules or `scripts/build_web_data.py`, not
   `demo/data.js` by hand.

## Development setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
make test
make lint
```

E1–E9 run without external data. For E10 and a full paper render, download the
Paderborn dataset:

```bash
python scripts/download_data.py
```

## Before opening a pull request

Run:

```bash
make ci
make web
```

`make ci` runs lint, unit tests, the experiments, the paper render when the
dataset is present, and verification. `make web` regenerates the console data
bundle. If your change touches the paper template, include the regenerated
`README.md` and figures. If it touches an experiment, include the regenerated
results and the verification summary.

Please also check:

- New or changed numbers have a claim path and a test where practical.
- The console still loads at `preview.html` and `demo/app.html`.
- No secrets, credentials, dataset files, or local paths are committed.
- The change is focused; unrelated refactors belong in a separate pull request.

## Commit messages

Use a short imperative subject, for example:

```text
fix: correct E6 pull-up feasibility window
docs: add beginner guide to the README front matter
```

Explain the evidence in the body when a number changes: which claim, which
path, and why the value moved.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow
[`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under the MIT
License for code and prose. The Paderborn dataset remains CC BY-SA 4.0.
