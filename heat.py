import os
import json
import time
import redis
import subprocess
from flask import Flask
from flask import render_template

import poller


app = Flask(__name__)


@app.route("/")
def chart():
    data = {'username': '1', 'site': '0'}
    zones = poller.get_zones()
    heat_bits = {'PORTA': '00001010', 'PORTB': '00000001'}
    zone_list = poller.translate_to_zones(zones, heat_bits)
    stats = poller.get_stats()

    labels = list(stats.keys())
    values = [11123, 42344, 145623, 41562, 56789, 12355, 81234, 134450, 41562, 43212, 44424, 12345]
    # for zone in stats:
    #     values.append(stats[zone]['uptime'])

    return render_template("chart.html",
                           labels=labels,
                           values=values)

@app.route("/")
def heat():
    zones = get_zones()
    # heat_bits = parse_port_status(get_port_status())
    heat_bits = {'PORTA': '00001010', 'PORTB': '00000001'}
    zone_list = translate_to_zones(zones, heat_bits)
    do_metrics(zone_list)

    return render_template(
             'mdb_index.html',
             porta=heat_bits['PORTA'],
             portb=heat_bits['PORTB'],
             zone_list=zone_list
           )


def do_metrics(current_state):
    state_history = {}
    redis_connection = redis.StrictRedis(host=os.environ.get("REDIS_HOST", "192.168.1.49"),
                                         port=os.environ.get("REDIS_PORT", 6379),
                                         password=os.environ.get("REDIS_AUTH", "biglongsuperfantasticpassword"))
    print("doing metrics")


def translate_to_zones(zones, heat_bits):
    heat_dict = {}
    for z in zones['PORTA']:
        big_end = heat_bits['PORTA'][::-1]
        if big_end[int(z)] is "1":
            print("IS ON")
            heat_dict[zones['PORTA'][z]] = 1
        else:
            heat_dict[zones['PORTA'][z]] = 0

    for z in zones['PORTB']:
        big_end = heat_bits['PORTB'][::-1]
        if big_end[int(z)] is "1":
            print("IS ON")
            heat_dict[zones['PORTB'][z]] = 1
        else:
            heat_dict[zones['PORTB'][z]] = 0
    return heat_dict


def get_heat_bits():
    cmd = 'mccdaq/get_heat'
    completed = subprocess.run(cmd, stdout=subprocess.PIPE)
    out = completed.stdout.decode('utf-8')
    return out


def parse_heat_bits(mccdaq_out):
    ports_dict = {'PORTA':'', 'PORTB':''}
    for line in mccdaq_out.split('\n'):
        if line.startswith('PORTA'):
            ports_dict['PORTA'] = format(int(line.split()[1]), '0>8b')
        if line.startswith('PORTB'):
            ports_dict['PORTB'] = format(int(line.split()[1]), '0>8b')
    print(ports_dict)
    return ports_dict


def get_zones():
    zones = {}
    with open('zones.json') as f:
        zones = json.load(f)
    return zones


if __name__ == "__main__":
    port = os.environ.get('PORT', 8080)
    app.run(host='0.0.0.0', port=port, debug=True)

