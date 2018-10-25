import os
import time
import datetime
import redis
import json
import subprocess

redis_connection = redis.StrictRedis(host=os.environ.get("REDIS_HOST", "192.168.1.49"),
                                     port=os.environ.get("REDIS_PORT", 6379),
                                     password=os.environ.get("REDIS_AUTH", "biglongsuperfantasticpassword"),
                                     charset="utf-8",
                                     decode_responses=True)

TIME_FORMAT = "%m-%d-%Y %H:%M:%S"


def main():
    zones = get_zones()
    port_status = parse_port_status(get_port_status())
    # port_status = {'PORTA': '00001010', 'PORTB': '00000001'}
    port_state = translate_to_zones(zones, port_status)
    init_stats(port_state)

    # stats = get_stats(zones)
    while True:
        port_status = parse_port_status(get_port_status())
        # port_status = {'PORTA': '00001000', 'PORTB': '00000001'}
        port_state = translate_to_zones(zones, port_status)
        do_metrics(port_state)
        time.sleep(1)


def get_stats():
    # stats = {
    #     'Apt Bedroom': {'state': '1',
    #                     'last_seen': "09-26-2014 16:34:22",
    #                     'uptime': '1234',
    #                     'total_runtime': '5000'}
    # }
    raw = redis_connection.get("stats")
    if raw:
        stats = json.loads(raw)
    else:
        stats = {}
    return stats


def init_stats(zones):
    init_dict = {'state': '0',
                 'last_seen': '0',
                 'uptime': '0',
                 'total_runtime': '0'}
    stats = get_stats()
    # look for changes in zone layout
    diddled = 0
    for zone in zones:
        if zone in stats:
            pass
        else:
            diddled = 1
            stats[zone] = init_dict

    if diddled:
        save_stats(stats)
    return stats


def do_metrics(current_state):

    stats = get_stats()
    now = datetime.datetime.now()

    for zone in stats:
        if current_state[zone] == stats[zone]['state'] == '0':
            # stayed off
            pass

        elif current_state[zone] == '1' and stats[zone]['state'] == '0':
            # turned on
            stats[zone]["state"] = "1"
            stats[zone]["last_seen"] = now.strftime(TIME_FORMAT)

        elif current_state[zone] == '0' and stats[zone]['state'] == '1':
            # turned off
            stats[zone]["state"] = "0"
            stats[zone]["uptime"] = "0"

        elif current_state[zone] == '1' and stats[zone]['state'] == '1':
            # stayed on
            elapsed = now - datetime.datetime.strptime(stats[zone]['last_seen'], TIME_FORMAT)

            stats[zone]["uptime"] = int(stats[zone]["uptime"]) + elapsed.seconds
            stats[zone]["last_seen"] = now.strftime(TIME_FORMAT)

    save_stats(stats)


def save_stats(stats):
    redis_connection.set("stats", json.dumps(stats))




    # if state_history != current_state:
    #     print("THINGS BE DIFFERENT HERE")
    #     #is something on that wasn't?
    #     historical_set = set(state_history.items())
    #     comparison_Set = set(current_state.items())
    #
    #     # setof things that are different
    #     # dict(comparison_Set- historical_set) to turn into dict
    #     print(comparison_Set - historical_set)
    #     diff_set = comparison_Set - historical_set
    #     for diff in diff_set:
    #         now = datetime.datetime.now()
    #         # new bit on
    #         if diff[1] is "@":
    #             stats[diff[0]]["last_seen"] = now.strftime("%m-%d-%Y %H:%M:%S")
    #             print('mer')
    #         else:
    #             # new bit off
    #             pass
    #
    #
    #
    # else:

def translate_to_zones(zones, heat_bits):
    heat_dict = {}
    for z in zones['PORTA']:
        big_end = heat_bits['PORTA'][::-1]
        if big_end[int(z)] is "1":
            heat_dict[zones['PORTA'][z]] = "1"
        else:
            heat_dict[zones['PORTA'][z]] = "0"
            # heat_dict[zones['PORTA'][z]] = big_end[int(z)]

    for z in zones['PORTB']:
        big_end = heat_bits['PORTB'][::-1]
        if big_end[int(z)] is "1":
            heat_dict[zones['PORTB'][z]] = "1"
        else:
            heat_dict[zones['PORTB'][z]] = "0"
    return heat_dict


def get_port_status():
    cmd = 'mccdaq/get_heat'
    completed = subprocess.run(cmd, stdout=subprocess.PIPE)
    out = completed.stdout.decode('utf-8')
    return out


def parse_port_status(mccdaq_out):
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
    main()

