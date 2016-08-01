#!/usr/bin/python
# -*- coding: utf-8 -*-

import os
import logging

from threading import Thread

from pogom import config
from pogom.app import Pogom
from pogom.utils import get_args, insert_mock_data, load_credentials
from pogom.search import Searcher, ApiAuthorizer, Credentials
from pogom.models import create_tables, Pokemon, Pokestop, Gym

log = logging.getLogger(__name__)

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(module)11s] [%(levelname)7s] %(message)s')

    logging.getLogger("peewee").setLevel(logging.INFO)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("pogom.pgoapi.pgoapi").setLevel(logging.WARNING)
    logging.getLogger("pogom.pgoapi.rpc_api").setLevel(logging.INFO)

    args = get_args()

    if args.debug:
        logging.getLogger("requests").setLevel(logging.DEBUG)
        logging.getLogger("pgoapi").setLevel(logging.DEBUG)
        logging.getLogger("rpc_api").setLevel(logging.DEBUG)

    create_tables()

    config['USERNAME'] = args.username
    config['PASSWORD'] = args.password
    config['AUTH_SERVICE'] = args.auth_service

    if args.ignore:
        Pokemon.IGNORE = [i.lower().strip() for i in args.ignore.split(',')]
    elif args.only:
        Pokemon.ONLY = [i.lower().strip() for i in args.only.split(',')]

    if args.mock:
        insert_mock_data(args.location, 6)

    if args.display_pokestops or args.display_lured:
        Pokestop.IGNORE = False

    if args.display_lured:
        Pokestop.LURED_ONLY = True

    if args.display_gyms:
        Gym.IGNORE = False

    authorizer = ApiAuthorizer(Credentials(args.auth_service, args.username, args.password))
    searcher = Searcher(authorizer, request_sleep=0.5)

    app = Pogom(__name__, searcher)
    config['ROOT_PATH'] = app.root_path

    if args.gmaps_key is not None:
        config['GMAPS_KEY'] = args.gmaps_key
    else:
        config['GMAPS_KEY'] = load_credentials(os.path.dirname(os.path.realpath(__file__)))['gmaps_key']
    app.run(threaded=True, debug=args.debug, host=args.host, port=args.port)
