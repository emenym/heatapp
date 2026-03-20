import json
from time import sleep
# import RPi.GPIO as GPIO
import lib16inpind
from pprint import pprint
import time
print("reading channel")
STACK = 0

ZONE_MAP = 'input_map.json'

zones = {
    "0":"Apt Bedroom",
    "1": "Apt Living Room",
    "2": "Apt Bath Room",
    "3": "Mike's Office",
    "4": "Mom's Office",
    "5": "Danielle's Office",
    "6": "Family Room",
    "7": "Dining Room",
    "8": "Living Room",
    "9": "Upstairs Bath Room",
    "10": "Master Bedroom",
    "11": "Dad's Office"
}



def map_bits_to_zones(bits):
    zone_state = {}
    num_zones = len(bits)
    for i in range(0, num_zones):
        idx = list(zones.values())[i]
        zone_state[idx] = bits[i]
    return zone_state

# bits = format(int(4), '0>' + str(len(zones.keys())) + 'b')
# map_bits_to_zones(bits[::-1])



def get_pi_port_status():
    all_state = lib16inpind.readAll(STACK)
    return all_state

def translate_pi_to_zones(zones, zone_state):
    bits = format(int(zone_state), '0>' + str(len(zones.keys())) + 'b')
    heat_dict = {}
    num_zones = len(bits)
    for i in range(0, num_zones):
        idx = list(zones.values())[i]
        heat_dict[idx] = bits[::-1][i]
    return heat_dict

def readpi():
    for i in range(0, 100):
        all_state = lib16inpind.readAll(STACK)
        
        state_obj = {
            "all": all_state
        }


        for j in range(1, 16):
            ch_state = lib16inpind.readCh(STACK, j)
            state_obj[j] = ch_state
            # print("Channel %d: %d" % (j, ch_state))
        
    pprint(state_obj)
    asdf = format(int(all_state), '0>20b')
    sleep(1)

def get_zones():
    zones = {}
    with open(ZONE_MAP) as f:
        zones = json.load(f)
    f.close()
    return zones


if __name__ == "__main__":
    zones = get_zones()

    while(True):
        status = get_pi_port_status()
        zone_status = translate_pi_to_zones(zones, status)
        pprint(zone_status)
        sleep(1)




