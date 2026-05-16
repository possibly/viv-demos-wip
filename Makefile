.PHONY: runtime compile serve

runtime:
	cd viv && npm ci && npm run build --workspace=runtimes/js
	cp viv/runtimes/js/dist/index.browser.js shared/viv-runtime.js

compile:
	for d in demos/*/; do \
		vivc -i $$d/sim.viv -o $$d/bundle.json; \
	done

serve:
	python3 -m http.server 8080
