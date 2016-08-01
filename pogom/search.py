#!/usr/bin/python
# -*- coding: utf-8 -*-

import os
import re
import sys
import json
import struct
import logging
import requests
import time
import threading

from pgoapi import PGoApi
from pgoapi.utilities import get_cell_ids

from . import config
from models import parse_map
from exceptions import LoginException

log = logging.getLogger(__name__)

TIMESTAMP = '\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000\000'
REQ_SLEEP = 10
AUTH_SLEEP = 30


class Credentials:
    class Service:
        GOOGLE = "google"
        POKEMON = "ptc"

    def __init__(self, service, username, password):
        self.service = service
        self.username = username
        self.password = password

class ApiAuthorizer:
    def __init__(self, credentials, max_tries=5, backoff=30.0, api=None):
        if api:
            self._api = api
        else:
            self._api = PGoApi()

        self.credentials = credentials
        self.max_tries = max_tries
        self.backoff = backoff
        self._login_lock = threading.Lock()

    def api(self):
        self.login()
        return self._api

    def login(self):
        self._login_lock.acquire()
        try:
            return self._login_unsync()
        finally:
            self._login_lock.release()

    def _login_unsync(self):
        max_tries = self.max_tries
        backoff = self.backoff
        api = self._api
        auth_service, username, password = self.credentials.service, self.credentials.username, self.credentials.password
        if api._auth_provider and api._auth_provider._ticket_expire:
            remaining_time = api._auth_provider._ticket_expire/1000 - time.time()

            if remaining_time > 60:
                log.info("Skipping Pokemon Go login process since already logged in for another {:.2f} seconds".format(remaining_time))
                return

        log.info('Attempting login to Pokemon Go.')

        api.set_position(0.0, 0.0, 0.0) # TODO: Should we be passing the previous position somehow?

        tries = 0
        while not api.login(auth_service, username, password):
            tries += 1
            if tries >= max_tries:
                raise LoginException()
            log.info('Failed to login to Pokemon Go. Trying again.')
            time.sleep(backoff)

        log.info('Login to Pokemon Go successful.')


class Searcher:
    def __init__(self, api_authorizer, retries=5, backoff=REQ_SLEEP, request_sleep=REQ_SLEEP):
        self._api = api_authorizer
        self._request_lock = threading.Lock()
        self.backoff = backoff
        self.retries = retries
        self.request_sleep = request_sleep

    def search(self, position, num_steps=1):
        i = 1
        for step_location in Searcher.generate_location_steps(position, num_steps):
            log.info('Scanning step {:d} of {:d}.'.format(i, num_steps**2))
            log.debug('Scan location is {:f}, {:f}'.format(step_location[0], step_location[1]))

            response_dict = self._send_map_request(step_location)
            tries = 0
            while not response_dict:
                log.info('Map Download failed. Trying again.')
                tries += 1
                if tries >= self.retries:
                    log.error("Map Download failed after %d retries, giving up" % (tries))
                    break
                time.sleep(self.backoff)
                response_dict = self._send_map_request(step_location)

            if not response_dict:
                break

            try:
                parse_map(response_dict)
            except KeyError:
                log.exception('Scan step failed. Response dictionary key error.')
                log.exception(response_dict)

            log.info('Completed {:5.2f}% of scan.'.format(float(i) / num_steps**2*100))
            i += 1
            time.sleep(self.request_sleep)

    def _send_map_request(self, position):
        self._request_lock.acquire()
        try:
            api = self._api.api()
            api.set_position(*position)
            resp = api.get_map_objects(latitude=position[0],
                                longitude=position[1],
                                cell_id=get_cell_ids(position[0], position[1]))
            return resp
        finally:
            self._request_lock.release()

    @staticmethod
    def generate_location_steps(initial_location, num_steps):
        pos, x, y, dx, dy = 1, 0, 0, 0, -1

        while -num_steps / 2 < x <= num_steps / 2 and -num_steps / 2 < y <= num_steps / 2:
            yield (x * 0.0025 + initial_location[0], y * 0.0025 + initial_location[1], 0)

            if x == y or (x < 0 and x == -y) or (x > 0 and x == 1 - y):
                dx, dy = -dy, dx

            x, y = x + dx, y + dy
