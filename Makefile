.PHONY: setup up down logs build dev test

## One-time: seed UID/GID into .env and create the app-data dir.
setup:
	@test -f .env || cp .env.example .env
	@grep -q '^UID=[0-9]' .env || printf 'UID=%s\nGID=%s\n' "$$(id -u)" "$$(id -g)" >> .env
	@mkdir -p .appdata
	@echo "Ready. Run 'make up' then open http://localhost:7878"

## Build + start the container.
up:
	docker compose up -d --build

## Stop the container.
down:
	docker compose down

## Tail logs.
logs:
	docker compose logs -f

## Build the image only.
build:
	docker compose build

## Run the dev stack (Vite + API) without Docker.
dev:
	npm run dev

## Run the test suite.
test:
	npm test
