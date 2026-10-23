.PHONY: install dev build preview test e2e icons docker docker-run clean

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

test:
	./scripts/test.sh

e2e: build
	npm run e2e

icons:
	npm run icons

docker:
	docker build -t bingo-escolar .

docker-run: docker
	docker run --rm -p 8080:8080 bingo-escolar

clean:
	rm -rf dist
