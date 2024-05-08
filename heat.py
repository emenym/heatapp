import os
import datetime
from flask import Flask, jsonify
from flask import render_template

import poller


app = Flask(__name__)


@app.route("/chart")
def chart():
    chart_data = get_all_chart_data()
    return render_template("chart.html",
                           labels=chart_data.get("labels"),
                            values=chart_data.get("values"),
                            runtimes=chart_data.get("runtimes"),
                            day_values=chart_data.get("day_values"))


def get_all_chart_data():
    values = []
    labels = list()
    state = poller.get_state()
    for s in state:
        labels.append(s["_id"])

    runtimes = get_total_uptime(labels)
    day_values = get_day_uptime(labels)
    for z in labels:
        values.append(get_latest_uptime(z))
    return {
        "labels": labels,
        "values": values,
        "runtimes": runtimes,
        "day_values": day_values
    }

@app.route('/get_current_uptime_chart_data', methods=['GET'])
def get_current_uptime_chart_data():
    values = []
    labels = list()
    state = poller.get_state()
    for s in state:
        labels.append(s["_id"])

    for z in labels:
        values.append(get_latest_uptime(z))
    return {
        "labels": labels,
        "values": values
    }

@app.route('/get_day_uptime_chart_data', methods=['GET'])
def get_day_uptime_chart_data():
    labels = list()
    state = poller.get_state()
    for s in state:
        labels.append(s["_id"])

    day_values = get_day_uptime(labels)
    return {
        "labels": labels,
        "day_values": day_values
    }

@app.route('/get_total_uptime_chart_data', methods=['GET'])
def get_total_uptime_chart_data():
    labels = list()
    state = poller.get_state()
    for s in state:
        labels.append(s["_id"])

    runtimes = get_total_uptime(labels)
    return {
        "labels": labels,
        "runtimes": runtimes
    }


@app.route('/update_chart_data', methods=['GET'])
def update_chart_data():
    chart_data = get_all_chart_data()
    return jsonify(chart_data)


@app.route("/")
def heat():
    zone_list = {}
    zone_states = poller.MONGO.get_zone_states()
    for i in zone_states:
        zone_list[i['_id']] = i['state']
    return render_template(
        'index.html',
        zone_list=zone_list
    )

@app.route('/update_zone_list', methods=['GET'])
def update_zone_list():
    zone_list = {}
    zone_states = poller.MONGO.get_zone_states()
    for i in zone_states:
        zone_list[i['_id']] = i['state']
    return jsonify(zone_list)

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
