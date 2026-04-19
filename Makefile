ROOT    := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
WEB     := $(ROOT)/gtv-frontend
BACKEND := $(ROOT)/gtv-backend
BRIDGE  := $(ROOT)/dev-tools/claude-bridge
PY      := $(HOME)/opt/anaconda3/envs/guillotine/bin

.PHONY: gtv

gtv:
	cd $(WEB) && npm install
	cd $(BACKEND) && $(PY)/pip install -q -r requirements.txt
	cd $(BRIDGE) && $(PY)/pip install -q -r requirements.txt
	@trap 'kill 0' EXIT; \
	cd $(BACKEND) && ENVIRONMENT=dev $(PY)/uvicorn app.main:app --host 0.0.0.0 --port 5001 --reload & \
	cd $(WEB) && npm run dev:web & \
	cd $(BRIDGE) && $(PY)/uvicorn server:app --host localhost --port 9100 --reload & \
	wait
