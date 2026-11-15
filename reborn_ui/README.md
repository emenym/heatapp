# Heating monitor

The dashboard shows heating calls and recorded runtime, not room temperature,
thermostat setpoints, boiler output, or confirmed heat delivery. An ON zone
means its mapped input is active. The GraphQL API remains available, but its
demo is not part of the residential dashboard.

Each dashboard section has an information button; hover, focus, or tap it for
an explanation. The anomaly button also lists the current rules.

The stream indicator tracks dashboard messages. Hardware sample freshness is
separate: the last successful sample is saved by the poller or Poll Now, even
when no state changes. A sample or stream becomes stale after three expected
intervals, with a minimum 15-second allowance. The poller's configured interval
travels with each sample. Simulated input is labeled and is not treated as fresh
hardware data. Mapping changes invalidate the sample until another is received.
Existing databases have no sample timestamp until the first successful sample.

Anomaly Watch applies fixed rules; it is not a diagnosis. It cannot assess
without fresh hardware and complete, recent timeline data. Historical data
records transitions rather than continuous coverage, so recording gaps cannot
be identified and an open interval may include time when the poller was down.
Daily timeline views use the browser's current time-zone offset, which may not
reflect historical daylight-saving changes. The schedule on the timeline is a
browser-local comparison window, not occupancy detection. Runtime references
are optional browser-local comparisons, not recommended targets.

Cycle distribution counts ON windows within a selected day, including partial
windows at day boundaries. Concurrency shows the peak number of distinct zones
simultaneously calling for heat within each 15-minute bin. Both suppress their
calculations when the server compresses the timeline.

Validate with `npm test` and `npm run build` in this directory, and
`.venv/bin/python -m unittest discover -s tests` from the repository root.
