$(function() {
    var map,
        marker,
        GeoMarker,
        lastStamp = 0,
        requestInterval = 10000;


    var markers = [];
    var gym_types = ["Uncontested", "Mystic", "Valor", "Instinct"];

    function pad(number) {
        return number <= 99 ? ("0" + number).slice(-2) : number;
    };

    function pokemonLabel (item) {
        disappear_date = new Date(item.disappear_time);

        var str = '\
        <div>\
            <b>' + item.pokemon_name + '</b>\
            <span> - </span>\
            <small>\
                <a href="http://www.pokemon.com/us/pokedex/' + item.pokemon_id + '" target="_blank" title="View in Pokedex">#' + item.pokemon_id + '</a>\
            </small>\
        </div>\
        <div>\
            Disappears at ' + pad(disappear_date.getHours()) + ':' + pad(disappear_date.getMinutes()) + ':' + pad(disappear_date.getSeconds()) + '\
            <span class="label-countdown" disappears-at="' + item.disappear_time + '"></span></div>\
        <div>\
            <a href="https://www.google.com/maps/dir/Current+Location/' + item.latitude + ',' + item.longitude + '"\
                    target="_blank" title="View in Maps">Get Directions</a>\
        </div>';

        return str;
    };

    function gymLabel(item) {
        var gym_color = ["0, 0, 0, .4", "74, 138, 202, .6", "240, 68, 58, .6", "254, 217, 40, .6"];
        var str;
        if (gym_types[item.team_id] == 0) {
            str = '\
            <div><center>\
            <div>\
                <b style="color:rgba(' + gym_color[item.team_id] + ')">' + gym_types[item.team_id] + '</b><br>\
            </div>\
            </center></div>';
        } else {
            str = '\
            <div><center>\
            <div>\
                Gym owned by:\
            </div>\
            <div>\
                <b style="color:rgba(' + gym_color[item.team_id] + ')">Team ' + gym_types[item.team_id] + '</b><br>\
                <img height="100px" src="/static/forts/' + gym_types[item.team_id] + '_large.png"> \
            </div>\
            <div>\
                Prestige: ' + item.gym_points + '\
            </div>\
            </center></div>';
        }

        return str;
    };

    function pokestopLabel(item) {
        var str;

        if (!item.lure_expiration) {
            str = '<div><center> \
                   <div><b>Pokéstop</b></div> \
               </center></div>';
        } else {
            expire_date = new Date(item.lure_expiration)
            str = '<div><center> \
                   <div><b>Pokéstop</b></div> \
                   <div><b>Lure enabled</b></div> \
                   Expires at ' + pad(expire_date.getHours()) + ':' + pad(expire_date.getMinutes()) + ':' + pad(expire_date.getSeconds()) + '\
                   <span class="label-countdown" disappears-at="' + item.lure_expiration + '"></span></div>\
               </center></div>';
        }
        return str;
    }

    function CenterControl(controlDiv, map) {

        // Set CSS for the control border.
        var controlUI = document.createElement('div');
        controlUI.style.backgroundColor = '#fff';
        controlUI.style.border = '2px solid #fff';
        controlUI.style.borderRadius = '3px';
        controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
        controlUI.style.cursor = 'pointer';
        controlUI.style.marginBottom = '22px';
        controlUI.style.textAlign = 'center';
        controlUI.title = 'Click to scan around you the map';
        controlDiv.appendChild(controlUI);

        // Set CSS for the control interior.
        var controlText = document.createElement('div');
        controlText.style.color = 'rgb(25,25,25)';
        controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
        controlText.style.fontSize = '16px';
        controlText.style.lineHeight = '38px';
        controlText.style.paddingLeft = '5px';
        controlText.style.paddingRight = '5px';
        controlText.innerHTML = 'Scan';
        controlUI.appendChild(controlText);

        // Setup the click event listeners: simply set the map to Chicago.
        controlUI.addEventListener('click', function() {
            var center = map.getCenter();
            searchPokemon(center);
        });

    }

    function initMap () {
        map = new google.maps.Map(document.getElementById('map'), {
            center: {lat: center_lat, lng: center_lng},
            zoom: 16
        });

        // Create the DIV to hold the control and call the CenterControl()
        // constructor passing in this DIV.
        var centerControlDiv = document.createElement('div');
        var centerControl = new CenterControl(centerControlDiv, map);

        centerControlDiv.index = 1;
        map.controls[google.maps.ControlPosition.TOP_CENTER].push(centerControlDiv);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (position) {
                var initialLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
                map.setCenter(initialLocation);
                searchPokemon(initialLocation);
            });
        }
        GeoMarker = new GeolocationMarker(map);
        GetNewPokemons(lastStamp);
        GetNewGyms();
        GetNewPokeStops();
    };

    function GetNewPokemons (stamp) {
        $.getJSON("/pokemons/" + stamp, function (result) {
            $.each(result, function (i, item) {

                var marker = new google.maps.Marker({
                    position: {lat: item.latitude, lng: item.longitude},
                    map: map,
                    icon: 'static/icons/' + item.pokemon_id + '.png'
                });

                marker.infoWindow = new google.maps.InfoWindow({
                    content: pokemonLabel(item)
                });

                google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                    delete marker["persist"];
                    marker.infoWindow.close();
                });

                marker.addListener('click', function () {
                    marker["persist"] = true;
                    marker.infoWindow.open(map, marker);
                });

                var markersItem = {
                    m: marker,
                    disapear: item.disappear_time
                };
                markers.push(markersItem);

                marker.addListener('mouseover', function () {
                    marker.infoWindow.open(map, marker);
                });

                marker.addListener('mouseout', function () {
                    if (!marker["persist"]) {
                        marker.infoWindow.close();
                    }
                });
            });
        }).always(function () {
            setTimeout(function () {
                GetNewPokemons(lastStamp);
                GetNewGyms();
                GetNewPokeStops();
            }, requestInterval)
        });

        var dObj = new Date();
        lastStamp = dObj.getTime();

        $.each(markers, function (i, item) {
            if (item.disapear <= lastStamp) {
                item.m.setMap(null);
            }
        });
    };

    function GetNewGyms () {
        $.getJSON("/gyms", function (result) {
            $.each(result, function (i, item) {
                var marker = new google.maps.Marker({
                    position: {lat: item.latitude, lng: item.longitude},
                    map: map,
                    icon: 'static/forts/' + gym_types[item.team_id] + '.png'
                });

                marker.infoWindow = new google.maps.InfoWindow({
                    content: gymLabel(item)
                });

                google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                    delete marker["persist"];
                    marker.infoWindow.close();
                });

                marker.addListener('click', function () {
                    marker["persist"] = true;
                    marker.infoWindow.open(map, marker);
                });

                marker.addListener('mouseover', function () {
                    marker.infoWindow.open(map, marker);
                });

                marker.addListener('mouseout', function () {
                    if (!marker["persist"]) {
                        marker.infoWindow.close();
                    }
                });
            });
        });
    };

    function GetNewPokeStops () {
        $.getJSON("/pokestops", function (result) {
            $.each(result, function (i, item) {
                var imagename = item.lure_expiration ? "PstopLured" : "Pstop";
                var marker = new google.maps.Marker({
                    position: {lat: item.latitude, lng: item.longitude},
                    map: map,
                    icon: 'static/forts/' + imagename + '.png'
                });

                marker.infoWindow = new google.maps.InfoWindow({
                    content: pokestopLabel(item)
                });

                if (item.lure_expiration) {
                    google.maps.event.addListener(marker.infoWindow, 'closeclick', function () {
                        delete marker["persist"];
                        marker.infoWindow.close();
                    });

                    marker.addListener('click', function () {
                        marker["persist"] = true;
                        marker.infoWindow.open(map, marker);
                    });

                    marker.addListener('mouseover', function () {
                        marker.infoWindow.open(map, marker);
                    });

                    marker.addListener('mouseout', function () {
                        if (!marker["persist"]) {
                            marker.infoWindow.close();
                        }
                    });
                } else {
                    marker.addListener('click', function () {
                        marker.infoWindow.open(map, marker);
                    });
                }
            });
        });
    };

    function setLabelTime () {
        $('.label-countdown').each(function (index, element) {
            var now = new Date().getTime();
            var diff = element.getAttribute("disappears-at") - now;

            if (diff > 0) {
                var min = Math.floor((diff / 1000) / 60);
                var sec = Math.floor((diff / 1000) - (min * 60));
                $(element).text("(" + pad(min) + "m" + pad(sec) + "s" + ")");
            } else {
                $(element).text("(Gone!)");
            }


        });
    };

    function searchPokemon (position) {
        var center = position || map.getCenter();
        var data = {
            position: center.toJSON(),
            step_limit: 5
        };
        $.post({
            url: "/search",
            data: JSON.stringify(data),
            contentType: "application/json; charset=utf-8",
            dataType: 'json',
            success: function () {
                console.log(center);
            }
        })
    };

    window.setInterval(setLabelTime, 1000);

    initMap();
});
