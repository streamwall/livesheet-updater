# Livesheet Updater
# Usage: make [command]

.PHONY: help up down shell test logs

help:
	@echo "Commands:"
	@echo "  up      - Start updater"
	@echo "  down    - Stop updater"
	@echo "  shell   - Container shell"
	@echo "  test    - Run tests"
	@echo "  logs    - View logs"

up:
	docker compose up -d

down:
	docker compose down

shell:
	docker compose exec livesheet-updater sh

test:
	npm test

logs:
	docker compose logs -f