SELF    := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
ROOT    := $(abspath $(SELF)/..)
WEB     := $(ROOT)/gtv-frontend
BACKEND := $(ROOT)/gtv-backend
BRIDGE  := $(SELF)/claude-bridge
WIDGET  := $(SELF)/claude-widget
VENV    := $(SELF)/.venv
PYTHON  := $(VENV)/bin/python
UV      := $(shell command -v uv 2>/dev/null)

GH_ORG  := https://github.com/guillotinethestartup

PYTHON_VERSION := 3.13

BACKEND_LOG := /tmp/gtv-backend.log
STAGING_API_URL ?= https://gtv-backend-staging.up.railway.app

.PHONY: gtv-local gtv-staging venv ensure-uv clean-ports

ensure-uv:
ifndef UV
	@echo "Installing uv..."
	@curl -LsSf https://astral.sh/uv/install.sh | sh
	$(eval UV := $(HOME)/.local/bin/uv)
endif

venv: ensure-uv $(VENV)/bin/activate

$(VENV)/bin/activate:
	@echo "Creating venv with Python $(PYTHON_VERSION)..."
	@$(UV) venv $(VENV) --python $(PYTHON_VERSION)

clean-ports:
	@lsof -ti:5001 | xargs kill -9 2>/dev/null || true
	@lsof -ti:9100 | xargs kill -9 2>/dev/null || true

gtv-local: venv clean-ports
	@test -d $(WEB) || (echo "Cloning gtv-frontend..." && git clone $(GH_ORG)/gtv-frontend.git $(WEB))
	@test -d $(BACKEND) || (echo "Cloning gtv-backend..." && git clone $(GH_ORG)/gtv-backend.git $(BACKEND))
	@echo "Installing dependencies..."
	@cd $(WIDGET) && npm install --silent && npm run build --silent 2>&1 | tail -1
	@cd $(WEB) && npm install --silent
	@cd $(WEB) && npm install --no-save --silent $(WIDGET) html2canvas react-markdown react-syntax-highlighter remark-gfm @types/react-syntax-highlighter
	@$(UV) pip install -q -r $(BACKEND)/requirements.txt --python $(PYTHON)
	@$(UV) pip install -q -r $(BRIDGE)/requirements.txt --python $(PYTHON)
	@echo ""
	@echo "  GTV is starting (local)..."
	@echo ""
	@echo "  Frontend:  http://localhost:3000"
	@echo "  Backend:   http://localhost:5001/docs"
	@echo "  Bridge:    http://localhost:9100"
	@echo ""
	@> $(BACKEND_LOG)
	@trap 'rm -f $(BACKEND_LOG); kill -9 0 2>/dev/null' EXIT INT TERM; \
	cd $(BACKEND) && PYTHONUNBUFFERED=1 ENVIRONMENT=dev $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port 5001 --reload 2>&1 | tee -a $(BACKEND_LOG) & \
	cd $(WEB) && npm run dev:web & \
	cd $(BRIDGE) && BACKEND_LOG_FILE=$(BACKEND_LOG) $(PYTHON) -m uvicorn server:app --host localhost --port 9100 --reload & \
	cd $(WIDGET) && npm run dev & \
	wait

gtv-staging: venv clean-ports
	@test -d $(WEB) || (echo "Cloning gtv-frontend..." && git clone $(GH_ORG)/gtv-frontend.git $(WEB))
	@test -d $(BACKEND) || (echo "Cloning gtv-backend..." && git clone $(GH_ORG)/gtv-backend.git $(BACKEND))
	@command -v railway > /dev/null 2>&1 || (echo "Error: Railway CLI not installed. Run: npm i -g @railway/cli" && exit 1)
	@cd $(BACKEND) && (railway status > /dev/null 2>&1 || (echo "" && echo "  Railway not linked — launching interactive setup..." && echo "" && railway link))
	@echo "Installing dependencies..."
	@cd $(WIDGET) && npm install --silent && npm run build --silent 2>&1 | tail -1
	@cd $(WEB) && npm install --silent
	@cd $(WEB) && npm install --no-save --silent $(WIDGET) html2canvas react-markdown react-syntax-highlighter remark-gfm @types/react-syntax-highlighter
	@$(UV) pip install -q -r $(BRIDGE)/requirements.txt --python $(PYTHON)
	@echo ""
	@echo "  GTV is starting (staging)..."
	@echo ""
	@echo "  Frontend:  http://localhost:3000"
	@echo "  Backend:   $(STAGING_API_URL) (staging)"
	@echo "  Bridge:    http://localhost:9100"
	@echo ""
	@trap 'kill -9 0 2>/dev/null' EXIT INT TERM; \
	cd $(WEB) && NEXT_PUBLIC_API_URL=$(STAGING_API_URL) npm run dev:web & \
	cd $(BRIDGE) && GTV_MODE=staging RAILWAY_ENVIRONMENT=staging $(PYTHON) -m uvicorn server:app --host localhost --port 9100 --reload & \
	cd $(WIDGET) && npm run dev & \
	wait
