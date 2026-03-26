.PHONY: ensure-env migrate migrate-remote deploy deploy-dry-run live live-dry-run start start-phone stop typecheck build test native-assets native-sync native-sync-ios native-sync-android native-open-ios native-open-android

PID_DIR := .run
API_PID_FILE := $(PID_DIR)/api.pid
WEB_PID_FILE := $(PID_DIR)/web.pid
LAN_IP ?= $(shell ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
STACK_SCRIPT := ./scripts/dev-stack.sh

ensure-env:
	@test -f apps/web/.env || cp apps/web/.env.example apps/web/.env
	@test -f apps/api/.dev.vars || cp apps/api/.dev.vars.example apps/api/.dev.vars

migrate: ensure-env
	npm run db:migrate --workspace @event-photo/api

migrate-remote:
	npm run db:migrate:remote --workspace @event-photo/api

deploy:
	npm run deploy --workspace @event-photo/api

deploy-dry-run:
	npm run deploy:dry-run --workspace @event-photo/api

live:
	npm run live

live-dry-run:
	npm run live:dry-run

start: migrate
	@$(STACK_SCRIPT) start

start-phone: migrate
	@$(STACK_SCRIPT) start-phone "$(LAN_IP)"

stop:
	@$(STACK_SCRIPT) stop

typecheck:
	npm run typecheck

build:
	npm run build

test:
	npm run test

native-assets:
	npm run native:assets

native-sync:
	npm run native:sync

native-sync-ios:
	npm run native:sync:ios

native-sync-android:
	npm run native:sync:android

native-open-ios:
	npm run native:open:ios

native-open-android:
	npm run native:open:android
