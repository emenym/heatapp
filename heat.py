import os
import datetime
from flask import Flask
from flask import render_template

import poller


app = Flask(__name__)


@app.route("/chart")
def chart():
    stats = poller.get_stats()
    values = []
    runtimes = []
    day_values = []
    labels = list(stats.keys())
    for z in labels:
        values.append(get_latest_uptime(z, stats))
        runtimes.append(get_total_uptime(z, stats))
        day_values.append(get_day_uptime(z, stats))
    return render_template("chart.html",
                           labels=labels,
                           values=values,
                           runtimes=runtimes,
                           day_values=day_values)


def get_port_state_redis():
    stats = poller.get_stats()


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
    d1 = datetime.datetime.strptime(d1, poller.TIME_FORMAT)
    d2 = datetime.datetime.strptime(d2, poller.TIME_FORMAT)

    delta = d2 - d1
    return delta.total_seconds()


def get_latest_uptime(z, stats):
    all_trans = stats[z]['transitions']
    if not all_trans:
        return 0

    latest_transition = all_trans[-1]
    if len(latest_transition) > 1:
        return 0

    return get_uptime([latest_transition])


def get_total_uptime(z, stats):
    all_trans = stats[z]['transitions']
    if not all_trans:
        return 0

    return get_uptime(all_trans)


def get_day_uptime(z, stats):
    all_trans = stats[z]['transitions']
    if not all_trans:
        return 0

    dayago = datetime.datetime.now() - datetime.timedelta(hours=24)
    day_transitions = []

    for trans in reversed(all_trans):
        if datetime.datetime.strptime(trans[0], poller.TIME_FORMAT) > dayago:
            day_transitions.append(trans)
        else:
            break
    return get_uptime(day_transitions)


def get_uptime(tranision_list):
    uptime = 0
    for transition in tranision_list:
        if len(transition) > 1:
            uptime += date_range_to_seconds(transition[0], transition[1])
        else:
            uptime += date_range_to_seconds(transition[0],
                                            datetime.datetime.now().strftime(poller.TIME_FORMAT))

    return uptime


if __name__ == "__main__":
    port = os.environ.get('PORT', 80)
    if port == '8080':
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        app.run(host='0.0.0.0', port=port, debug=False)
