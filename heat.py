import os
import datetime
from flask import Flask
from flask import render_template

import poller


app = Flask(__name__)


@app.route("/chart")
def chart():
    values = []
    labels = list()
    state = poller.get_state()
    for s in state:
        labels.append(s["_id"])

    runtimes = get_total_uptime(labels)
    day_values = get_day_uptime(labels)
    for z in labels:
        values.append(get_latest_uptime(z))
    return render_template("chart.html",
                           labels=labels,
                           values=values,
                           runtimes=runtimes,
                           day_values=day_values)


# TODO get heatbits from redis instead of mccdaq
@app.route("/")
def heat():
    zones = poller.get_zones()
    heat_bits = poller.parse_port_status(poller.get_port_status())
    zone_list = poller.translate_to_zones(zones, heat_bits)
    return render_template(
        'index.html',
        porta=heat_bits['PORTA'],
        portb=heat_bits['PORTB'],
        zone_list=zone_list
    )


def date_range_to_seconds(d1, d2):
    delta = d2 - d1
    return delta.total_seconds()


def get_latest_uptime(z):
    latest = poller.MONGO.get_latest_transition(z)
    if not latest:
        return 0
    if latest.get("stop"):
        return 0
    latest_transition = [latest["start"]]
    return get_uptime([latest_transition])


def get_total_uptime(labels):
    zone_uptime = poller.MONGO.get_all_zone_runtimes()
    zone_uptime = insert_missing(zone_uptime, labels)
    return zone_uptime


def insert_missing(uptimes, labels):
    newlist = list()

    for l in labels:
        if l in uptimes:
            newlist.append(uptimes.get(l))
        else:
            newlist.append(0)

    return newlist


def get_day_uptime(labels):
    dayago = poller.MONGO.get_day_ago()
    dayago = insert_missing(dayago, labels)
    return dayago


def get_uptime(tranision_list):
    uptime = 0
    for transition in tranision_list:
        if len(transition) > 1:
            uptime += date_range_to_seconds(transition[0], transition[1])
        else:
            uptime += date_range_to_seconds(transition[0],datetime.datetime.utcnow())

    return uptime


if __name__ == "__main__":
    port = os.environ.get('PORT', 80)
    if port == '8080':
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        app.run(host='0.0.0.0', port=port, debug=False)
