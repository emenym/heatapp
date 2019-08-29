import os
import pymongo
import datetime


STAGING_DB = 'staging'
DBNAME = 'heatdb'
if os.environ.get('STAGING'):
    DBNAME = STAGING_DB
STATE_COLLECTION = 'zone_state'
TRANSITION_COLLECTION = 'transitions'
DEBUG = os.environ.get('DEBUG', None)


class MongoManager(object):
    def __init__(self, server='127.0.0.1', port=27017):
        user = os.environ.get('MONGODB_USER', 'heatapp')
        pwd = os.environ.get('MONGODB_PWD')
        self.client = pymongo.MongoClient(
            host="mongodb://{server}:{port}/".format(
                server=server,
                port=port),
            username=user,
            password=pwd,
            authSource='admin',
            authMechanism='SCRAM-SHA-256')

    def __del__(self):
        self.client.close()

    @property
    def db(self):
        return self.client[DBNAME]

    @property
    def states(self):
        return self.client[DBNAME][STATE_COLLECTION]

    @property
    def transitions(self):
        return self.client[DBNAME][TRANSITION_COLLECTION]

    def insert_zones(self, zones):
        result = self.states.insert_many(zones)
        debug_print(result)

    def get_zone_states(self):
        s = self.states.find()
        return self.to_list(s)

    def to_list(self, cursor):
        ret = list()
        for x in cursor:
            ret.append(x)
        return ret

    def turn_off(self, zone):
        self.set_state(zone, "0")
        self.add_stop_transition(zone)

    def turn_on(self, zone):
        self.set_state(zone, "1")
        self.add_start_transition(zone)

    def set_state(self, zone, state):
        query = {"_id": zone}
        new = {"$set": {"state": state}}
        print_this(self.states, query)
        result = self.states.update_one(query, new)
        print_this(self.states, query)

    def add_start_transition(self, zone):
        query = {"zone_id": zone, "start": datetime.datetime.utcnow()}

        print_this(self.transitions, query)
        self.transitions.insert_one(query)
        print_this(self.transitions, query)

    def add_stop_transition(self, zone):
        now = datetime.datetime.utcnow()
        query = {"zone_id": zone, "stop": {"$exists": False}}
        new = {"$set": {"stop": now}}

        print_this(self.transitions, query)
        result = self.transitions.update_one(query, new)
        print_this(self.transitions, {"zone_id": zone, "stop": now})

    def remove_transitions(self, query):
        self.transitions.delete_many(query)

    def remove_dangling(self):
        # transitions without a stop time
        query = {"stop": {"$exists": False}}
        self.remove_transitions(query)

    def get_latest_transition(self, zone):
        res = self.transitions.find({"zone_id": zone}).sort([("start", -1)]).limit(1)
        for x in res:
            return x

    def get_day_ago(self):
        dayago = datetime.datetime.now() - datetime.timedelta(hours=24)
        updated = self.set_temp_stop()

        pipeline = [
            {"$match": {"start": {"$gt": dayago}}},
            {"$group":
                {
                    "_id": "$zone_id",
                    "total_seconds": {
                        "$sum": {
                            "$divide": [
                                {"$subtract": ["$stop", "$start"]},
                                1000
                            ]
                        }
                    }
                }
            }

        ]

        cursor = self.transitions.aggregate(pipeline)
        res = dict()
        for doc in cursor:
            debug_print(doc)
            res[doc["_id"]] = doc['total_seconds']
        self.remove_stops(updated)
        return res

    def _get_zone_total_runtime(self, zone):
        pipeline = [
            {"$match": {"zone_id": zone}},
            {"$group":
                {
                    "_id": "zone_id",
                    "total_seconds": {
                        "$sum": {
                            "$divide": [
                                {"$subtract": ["$stop", "$start"]},
                                1000
                            ]
                        }
                    }
                }
            }

        ]
        res = self.transitions.aggregate(pipeline)
        for x in res:
            debug_print(x)
            return x["total_seconds"]

    def get_all_zone_runtimes(self):
        updated = self.set_temp_stop()
        res = self.transitions.aggregate([
            {
                '$group': {
                    '_id': '$zone_id',
                    'total_seconds': {
                        '$sum': {
                            '$divide': [
                                {
                                    '$subtract': [
                                        '$stop', '$start'
                                    ]
                                }, 1000
                            ]
                        }
                    }
                }
            }
        ])
        ret = list()
        ret_dict = dict()
        for x in res:
            debug_print(x)
            ret.append(x)
            ret_dict[x["_id"]] = x["total_seconds"]

        self.remove_stops(updated)
        return ret_dict

    def get_zone_total_runtime(self, zone):
        updated = self.set_temp_stop()
        total_zone_runtime = self._get_zone_total_runtime(zone)
        self.remove_stops(updated)
        return total_zone_runtime

    def set_temp_stop(self):
        query = {"stop": {"$exists": False}}
        now = datetime.datetime.utcnow()
        update = {"$set": {"stop": now}}
        list_updated = list()
        res = self.transitions.find_one_and_update(query, update)
        while(res):
            list_updated.append(res)
            res = self.transitions.find_one_and_update(query, update)

        return list_updated

    def remove_stops(self, doc_list):
        update = {"$unset": {"stop": ""}}
        for d in doc_list:
            query = {"_id": d["_id"]}
            self.transitions.update_one(query, update)


def debug_print(stuff):
    if DEBUG:
        print(stuff)


def print_this(collection, query, qfilter=None):
    doc = get_this(collection, query, qfilter)
    for x in doc:
        debug_print(x)


def get_this(collection, query, qfilter=None):
    if qfilter:
        doc = collection.find(query, qfilter)
    else:
        doc = collection.find(query)
    return doc
