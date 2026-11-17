# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-17

### Added

- Claim registry C01–C22 with observed value, claimed value, verdict, and a
  JSON artifact path for every entry.
- Ten executable experiments: six-step ripple, SVPWM headroom, dead-time
  harmonics, M/T speed measurement, Kt/Ke conventions, I2C pull-ups, RS-485
  failsafe bias, IPC trace width, H-bridge ripple, and the Paderborn PMSM
  analysis.
- Generated paper and README (`paper/paper.md.j2` → `README.md`) with figures
  resolved from `results/results.json`.
- Field-by-field verification loop (`make verify`) covering 34,650 scalar
  fields.
- Static audit console with claim search, experiment cards, six interactive
  labs, a quiz, a field guide, and keyboard navigation.
- 3D concept game with six missions tied to the claim registry.
- GitHub Pages landing page, live tabbed preview, and styled 404 page.
- Docker image, CI workflow, release workflow, container workflow, and
  dependency updates.

### Verified

- 22 claims: 10 supported, 5 qualified, 7 refuted.
- Maximum relative difference across stored and re-run results: 0.000e+00.
- Unit tests, Ruff lint, and the full experiment/verification pipeline pass.

### Known limits

- The audit is numerical, datasheet-based, and data-based. It is not a hardware
  measurement.
- E10 requires the public Paderborn CSV; the repository does not redistribute
  the dataset.

[1.0.0]: https://github.com/M0-AR/embedded-claims-audit/releases/tag/v1.0.0
