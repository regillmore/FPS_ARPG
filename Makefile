GODOT ?= godot
PROJECT ?= .
EXPORT_NAME ?= build/game.x86_64
PRESET ?= "Linux"

.PHONY: env check cs export
env:
	$(GODOT) --version || true

check:
	$(GODOT) --headless --path $(PROJECT) --check-only

cs:
	# Only needed for C# projects
	$(GODOT) --headless --path $(PROJECT) --build-solutions --quit

export:
	# Requires a configured export_presets.cfg with a preset named $(PRESET)
	$(GODOT) --headless --path $(PROJECT) --export-release $(PRESET) $(EXPORT_NAME)
