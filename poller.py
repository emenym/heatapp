import os
import time
import json
import subprocess
import mongo_manager


# DEBUG_STATUS = 'USB 1024LS Device is found! \nPORTA: 0\nPORTB: 0'
MONGO = mongo_manager.MongoManager()


def main():
    zones = get_zones()
    port_status = parse_port_status(get_port_status())
    port_state = translate_to_zones(zones, port_status)
    init_zones(port_state)
    init_transitions()

    while True:
        port_status = parse_port_status(get_port_status())
        port_state = translate_to_zones(zones, port_status)
        do_metrics(port_state)
        time.sleep(2)


def get_state():
    return MONGO.get_zone_states()


def init_zones(zones):
    insert = list()
    known_zones = list()

    for zone_dict in MONGO.get_zone_states():
        known_zones.append(zone_dict["_id"])

    for zone in zones:
        if zone not in known_zones:
            insert.append({"_id": zone, "state": zones[zone]})

    if insert:
        MONGO.insert_zones(insert)


def init_transitions():
    # remove transitions without stop time
    MONGO.remove_dangling()


def list_to_dict(some_list):
    ret = dict()
    for i in some_list:
        ret[i["_id"]] = i["state"]
    return ret


def do_metrics(current_state):

    saved_state = list_to_dict(MONGO.get_zone_states())

    for zone in saved_state:
        if (zone not in current_state):
            # zone was removed
            if saved_state[zone] == '1':
                # was still on
                MONGO.turn_off(zone)

            # remove zone from state db
            MONGO.remove_zones({"_id": zone})
            continue

        if current_state[zone] == saved_state[zone]:
            # stayed off
            pass

        elif current_state[zone] == '1' and saved_state[zone] == '0':
            # turned on
            MONGO.turn_on(zone)

        elif current_state[zone] == '0' and saved_state[zone] == '1':
            # turned off
            MONGO.turn_off(zone)

        elif current_state[zone] == '1' and saved_state[zone] == '1':
            # stayed on
            pass


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
    if os.environ.get('DEBUG'):
        try:
            with open('portstatusdebug') as f:
                debug_status = f.read()
                return debug_status
        except FileNotFoundError as fnf:
            print(fnf)
            exit(-1)

    cmd = 'mccdaq/get_heat'
    completed = subprocess.run(cmd, stdout=subprocess.PIPE)
    out = completed.stdout.decode('utf-8')
    i = 0
    out = 'USB 1024LS and USB 1024HLS not found.'
    while 'NOT' in out or 'not' in out:
        completed = subprocess.run(cmd, stdout=subprocess.PIPE)
        out = completed.stdout.decode('utf-8')
        i += 1
        if i >= 10:
            raise Exception('Error retrieving data from mccdaq')
        time.sleep(1)
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

