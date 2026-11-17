PY ?= python3
export PYTHONPATH := src

.PHONY: all experiments paper verify test lint ci data web serve release clean docker docker-run

all: experiments paper verify web

experiments:
	$(PY) -m eca.run

paper: experiments
	$(PY) -m eca.paper

verify:
	$(PY) -m eca.verify

web:
	$(PY) scripts/build_web_data.py

serve:
	$(PY) -m http.server 8000

test:
	$(PY) -m pytest

lint:
	ruff check src tests scripts

ci: lint test experiments
	@if [ -f data/raw/measures_v2.csv ]; then $(PY) -m eca.paper; else echo "skip paper: data/raw/measures_v2.csv absent"; fi
	$(PY) -m eca.verify
	$(PY) scripts/build_web_data.py

release: lint test
	rm -rf dist build src/*.egg-info
	$(PY) -m build
	cd dist && sha256sum * > SHA256SUMS

data:
	$(PY) scripts/download_data.py

clean:
	rm -f results/*.json results/figures/*.png results/figures/*.pdf
	rm -rf .pytest_cache .ruff_cache

docker:
	docker compose build

docker-run:
	docker compose run --rm audit
