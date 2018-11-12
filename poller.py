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

STATS_KEY = 'stats'
TIME_FORMAT = "%m-%d-%Y %H:%M:%S"
DEBUG_STATUS = 'USB 1024LS Device is found! \nPORTA: 0\nPORTB: 0'


def main():
    zones = get_zones()
    port_status = parse_port_status(get_port_status())
    port_state = translate_to_zones(zones, port_status)
    init_stats(port_state)

    while True:
        port_status = parse_port_status(get_port_status())
        port_state = translate_to_zones(zones, port_status)
        do_metrics(port_state)
        time.sleep(2)


def get_stats():
    # stats = {
    #     'Apt Bedroom': {'state': '1',
    #                     'transitions': [['09-26-2014 16:34:22', '09-26-2014 16:34:23'],
    #                                     ['09-26-2014 16:44:22', '09-26-2014 16:44:23]'
    #                                    ]
    #                    }
    # }

    if os.environ.get('STAGING'):
        global STATS_KEY
        STATS_KEY = 'staging_stats'

    raw = redis_connection.get(STATS_KEY)
    if raw:
        stats = json.loads(raw)
    else:
        stats = {}
    return stats


def save_stats(stats):
    if os.environ.get('STAGING'):
        global STATS_KEY
        STATS_KEY = 'staging_stats'
    redis_connection.set(STATS_KEY, json.dumps(stats))


def init_stats(zones):
    init_dict = {'state': '0',
                 'transitions': []
                 }
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
            stats[zone]["transitions"].append([now.strftime(TIME_FORMAT)])

        elif current_state[zone] == '0' and stats[zone]['state'] == '1':
            # turned off
            stats[zone]["state"] = "0"

            try:
                latest_transition = stats[zone]["transitions"].pop()
            except IndexError:
                # turn on transition not recorded, do nothing
                return
            if not latest_transition:
                # transition is empty, discard it
                return

            latest_transition.append(now.strftime(TIME_FORMAT))
            stats[zone]["transitions"].append(latest_transition)

        elif current_state[zone] == '1' and stats[zone]['state'] == '1':
            # stayed on
            pass

    save_stats(stats)


def translate_to_zones(zones, heat_bits):
    heat_dict = {}
    for z in zones['PORTA']:
        big_end = heat_bits['PORTA'][::-1]
        if big_end[int(z)] is "1":
            heat_dict[zones['PORTA'][z]] = "1"
        else:
            heat_dict[zones['PORTA'][z]] = "0"

    for z in zones['PORTB']:
        big_end = heat_bits['PORTB'][::-1]
        if big_end[int(z)] is "1":
            heat_dict[zones['PORTB'][z]] = "1"
        else:
            heat_dict[zones['PORTB'][z]] = "0"
    return heat_dict


def get_port_status():
    if os.environ.get('DEBUGGER'):
        return DEBUG_STATUS
    cmd = 'mccdaq/get_heat'
    completed = subprocess.run(cmd, stdout=subprocess.PIPE)
    out = completed.stdout.decode('utf-8')
    print(out)
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
    f.close()
    return zones


if __name__ == "__main__":
    main()

