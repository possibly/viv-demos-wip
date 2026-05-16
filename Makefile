.PHONY: runtime compile serve

runtime:
	cd viv && npm ci && npm run build
	cp viv/dist/index.browser.js shared/viv-runtime.js

compile:
	for d in demos/*/; do \
		viv/compiler/compile $$d/sim.viv > $$d/bundle.json; \
	done

serve:
	python3 -m http.server 8080
