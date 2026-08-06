.PHONY: verify demo research biofoundry realtime nl-dsl clean
verify:
	npm run verify

demo:
	npm run demo

research:
	npm run demo:research

biofoundry:
	npm run demo:biofoundry

realtime:
	npm run demo:realtime

nl-dsl:
	npm run demo:nl-dsl

clean:
	npm run clean
