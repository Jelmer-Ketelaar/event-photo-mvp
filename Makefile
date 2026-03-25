.PHONY: ensure-env migrate start stop typecheck build test native-assets native-sync native-sync-ios native-sync-android native-open-ios native-open-android

PID_DIR := .run
API_PID_FILE := $(PID_DIR)/api.pid
WEB_PID_FILE := $(PID_DIR)/web.pid

ensure-env:
	@test -f apps/web/.env || cp apps/web/.env.example apps/web/.env
	@test -f apps/api/.dev.vars || cp apps/api/.dev.vars.example apps/api/.dev.vars

migrate: ensure-env
	npm run db:migrate --workspace @event-photo/api

start: migrate
	@echo "Starting API on http://127.0.0.1:8787 and web on http://localhost:5173"
	@mkdir -p $(PID_DIR)
	@npm run dev:api & API_PID=$$!; \
	echo $$API_PID > $(API_PID_FILE); \
	npm run dev:web & WEB_PID=$$!; \
	echo $$WEB_PID > $(WEB_PID_FILE); \
	trap 'for pid_file in $(API_PID_FILE) $(WEB_PID_FILE); do \
		if [ -f $$pid_file ]; then \
			pid=$$(cat $$pid_file); \
			kill $$pid 2>/dev/null || true; \
			rm -f $$pid_file; \
		fi; \
	done; \
	rmdir $(PID_DIR) 2>/dev/null || true' INT TERM EXIT; \
	wait $$API_PID $$WEB_PID

stop:
	@for pid_file in $(API_PID_FILE) $(WEB_PID_FILE); do \
		if [ -f $$pid_file ]; then \
			pid=$$(cat $$pid_file); \
			kill $$pid 2>/dev/null || true; \
			rm -f $$pid_file; \
		fi; \
	done
	@rmdir $(PID_DIR) 2>/dev/null || true

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
