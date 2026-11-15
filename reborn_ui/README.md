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

The poller reads all inputs every 0.25 seconds by default; `REBORN_POLL_INTERVAL`
can override this in seconds. Reads run independently of database writes. State
changes are queued in order, and while the state is unchanged a heartbeat is
saved at the first sample after two seconds. The poller logs the measured mean
and maximum read intervals, missed scheduled reads, and process CPU usage each
minute. A full queue or writer failure stops the poller rather than silently
discarding readings; monitoring then becomes stale. A normal service stop
drains the queue. Poll Now waits for a new poller sample and reports an error
if the poller is unavailable.

Transitions have subsecond UTC timestamps. Completed calls that both start and
end during one poller run also retain their monotonic-clock duration for cycle
classification; older calls and calls spanning a restart use their UTC
timestamps instead. The database schema is upgraded on startup. Sampling is
not continuous: pulses shorter than the interval can still be missed, and OS,
I/O, or database delays can affect observations. Clock corrections can affect
wall-clock timelines even when monotonic durations are available.

Anomaly Watch applies rules; it is not a diagnosis. Brief pulses and short
completed calls have separate indicators, based on uncompressed transitions
ending within rolling windows. By default, it flags 25 or more calls of at
most 5 seconds in 24 hours, or 5 or more calls longer than 5 seconds but
shorter than 5 minutes in 60 minutes. The cycle settings can be changed in the
panel and are stored per browser, not shared between devices. The raw
transitions are not filtered or changed; completed-call counts below the
warning thresholds are available in the panel. Durations are sampled estimates:
brief pulses may reflect input chatter or thermostat power behavior, but do
not prove charging, a heat call, or boiler operation. Other anomaly rules remain
unchanged. Cycle indicators require fresh hardware and recent count data.
Historical data
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
