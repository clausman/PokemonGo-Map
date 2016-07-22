#!/usr/bin/python
# -*- coding: utf-8 -*-

import calendar
from flask import Flask, jsonify, render_template, request
from flask.json import JSONEncoder
from datetime import datetime
from threading import Thread
from pogom.search import search
import json


from . import config
from .models import Pokemon, Gym, Pokestop


class Pogom(Flask):
    def __init__(self, import_name, **kwargs):
        super(Pogom, self).__init__(import_name, **kwargs)
        self.json_encoder = CustomJSONEncoder
        self.route("/", methods=['GET'])(self.fullmap)
        self.route("/pokemons/<stamp>", methods=['GET'])(self.pokemons)
        self.route("/pokemons", methods=['GET'])(self.pokemons_all)
        self.route("/gyms", methods=['GET'])(self.gyms)
        self.route("/pokestops", methods=['GET'])(self.pokestops)
        self.route("/raw_data", methods=['GET'])(self.raw_data)
        self.route("/search", methods=['POST'])(self.search)

    def fullmap(self):
        return render_template('map.html',
                               lat=config['ORIGINAL_LATITUDE'],
                               lng=config['ORIGINAL_LONGITUDE'],
                               gmaps_key=config['GMAPS_KEY'])

    def get_raw_data(self, stamp):
        return {
            'gyms': [g for g in Gym.get()],
            'pokestops': [p for p in Pokestop.get()],
            'pokemons': Pokemon.get_active(stamp)
        }

    def raw_data(self):
        return jsonify(self.get_raw_data(None))

    def pokemons(self, stamp):
        return jsonify(self.get_raw_data(stamp)['pokemons'])

    def pokemons_all(self):
        return jsonify(self.get_raw_data(None)['pokemons'])

    def pokestops(self):
        return jsonify(self.get_raw_data(None)['pokestops'])

    def gyms(self):
        return jsonify(self.get_raw_data(None)['gyms'])

    def search(self):
        params = request.get_json()
        geocord = params['position']
        position = [geocord['lat'], geocord['lng'], 0]
        if 'step_limit' in params:
            step_limit = int(params['step_limit'])
        else:
            step_limit = 1

        sleep = 0.1
        search_thread = Thread(target=search, args=(position, step_limit, sleep))
        search_thread.daemon = True
        search_thread.name = 'search'
        search_thread.start()
        return json.dumps({'success': True}), 200, {'ContentType': 'application/json'}


class CustomJSONEncoder(JSONEncoder):

    def default(self, obj):
        try:
            if isinstance(obj, datetime):
                if obj.utcoffset() is not None:
                    obj = obj - obj.utcoffset()
                millis = int(
                    calendar.timegm(obj.timetuple()) * 1000 +
                    obj.microsecond / 1000
                )
                return millis
            iterable = iter(obj)
        except TypeError:
            pass
        else:
            return list(iterable)
        return JSONEncoder.default(self, obj)
