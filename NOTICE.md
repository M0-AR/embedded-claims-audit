# Third-party notices

This repository combines original code and prose with third-party software,
data, and references. The MIT license in [`LICENSE`](LICENSE) applies to the
original code and prose unless a file says otherwise.

## Vendored software

| Component | Version | License | Location |
|---|---|---|---|
| Three.js | r160 | MIT | [`demo/vendor/three.module.js`](demo/vendor/three.module.js) |

The Three.js header retains its copyright and SPDX identifier. The vendored
file is unmodified except for being stored in this repository.

## Data

The Paderborn LEA PMSM temperature dataset is published by its authors under
CC BY-SA 4.0. It is **not** redistributed in this repository. The analysis uses
the copy downloaded from Kaggle (`wkirgsn/electric-motor-temperature`); see
`scripts/download_data.py` for the expected checksum and the dataset citation.

## References and datasheets

The paper cites and discusses documents from ODrive Robotics, NXP
Semiconductors, Texas Instruments, STMicroelectronics, IPC, Cadence, rftools,
Kaggle, and several textbooks. Those documents are not redistributed here. The
citations identify the sources of the conventions and parameters used in the
experiments.

## Python dependencies

The package depends on NumPy, SciPy, pandas, Matplotlib, PyYAML, and Jinja2,
each under its own license. Development dependencies are pytest, Ruff, and
build. Container base images and GitHub Actions are used under their respective
terms. Consult the installed package metadata for the exact license text of a
given version.

## Trademarks

Product names, company names, and trademarks mentioned in the paper or the
console belong to their respective owners. Their use is descriptive and does
not imply endorsement.
