SELF    := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
ROOT    := $(abspath $(SELF)/..)
WEB     := $(ROOT)/gtv-frontend
BACKEND := $(ROOT)/gtv-backend
BRIDGE  := $(SELF)/claude-bridge
WIDGET  := $(SELF)/claude-widget

GH_ORG  := https://github.com/guillotinethestartup

.PHONY: gtv

gtv:
	@test -d $(WEB) || (echo "Cloning gtv-frontend..." && git clone $(GH_ORG)/gtv-frontend.git $(WEB))
	@test -d $(BACKEND) || (echo "Cloning gtv-backend..." && git clone $(GH_ORG)/gtv-backend.git $(BACKEND))
	cd $(WEB) && npm install
	cd $(WEB) && npm install --no-save $(WIDGET) html2canvas react-markdown react-syntax-highlighter remark-gfm @types/react-syntax-highlighter
	cd $(BACKEND) && pip install -q -r requirements.txt
	cd $(BRIDGE) && pip install -q -r requirements.txt
	@trap 'kill 0' EXIT; \
	cd $(BACKEND) && ENVIRONMENT=dev uvicorn app.main:app --host 0.0.0.0 --port 5001 --reload & \
	cd $(WEB) && npm run dev:web & \
	cd $(BRIDGE) && uvicorn server:app --host localhost --port 9100 --reload & \
	wait
