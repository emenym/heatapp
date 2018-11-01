import os
from flask import Flask
from flask import render_template

import poller


app = Flask(__name__)


@app.route("/chart")
def chart():
    stats = poller.get_stats()
    values = []
    runtimes = []
    labels = list(stats.keys())
    for z in labels:
        values.append(stats[z]['uptime'])
        runtimes.append(stats[z]['total_runtime'])
    return render_template("chart.html",
                           labels=labels,
                           values=values,
                           runtimes=runtimes)

#TODO get heatbits from redis instead of mccdaq
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


if __name__ == "__main__":
    port = os.environ.get('PORT', 8080)
    if port is 8080:
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        app.run(host='0.0.0.0', port=port, debug=True)
