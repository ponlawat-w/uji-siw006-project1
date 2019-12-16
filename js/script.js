const foursquareV = '20191212';

$(document).ready(() => {
  const data = {
    global: {
      exploreResults: null,
      myLocation: {lat: 0, lng: 0}
    },
    map: {
      map: null,
      markersGroup: null,
      venues: [],
      popupShown: false
    }
  };

  const getRecommendedVenues = () => {
    if (!data.global.exploreResults) {
      return [];
    }
    let group = data.global.exploreResults.groups.filter(g => g.name === 'recommended');
    group = group && group.length ? group[0] : null;
    if (!group) {
      return [];
    }
    return group.items.map(i => i.venue);
  };

  const creatUrl = (baseUrl, params = {}) =>
    `${baseUrl}?${Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')}`;

  const createApiUrl = (baseUrl, params = {}) => {
    params = {
      ...params,
      client_id: CONFIG.FOURSQUARE_CLIENT_ID,
      client_secret: CONFIG.FOURSQUARE_CLIENT_SECRET,
      v: foursquareV
    }

    return creatUrl(baseUrl, params);
  };

  const getDefaultRequestHeader = () => ({
    'Accept-Language': 'en'
  });
  
  const getLocationFromIP = () => new Promise((resolve, reject) => {
    const success = response => {
      resolve({
        lat: parseFloat(response.latitude),
        lng: parseFloat(response.longitude)
      });
    };

    const failed = response => {
      reject(response);
    };

    $.ajax({
      url: creatUrl('https://api.ipgeolocation.io/ipgeo', {apiKey: CONFIG.IP_GEOLOCATION_API_KEY}),
      method: 'GET',
      success: success,
      error: failed
    });
  });

  const exploreVenues = (latitude, longitude) => new Promise((resolve, reject) => {
    const success = response => {
      if (response.meta && response.meta.code === 200) {
        resolve(response.response);
      } else {
        reject('Error');
      }
    };

    const failed = error => {
      reject(error);
    }

    const requestUrl = createApiUrl('https://api.foursquare.com/v2/venues/explore', {
      ll: `${latitude},${longitude}`
    });

    $.ajax({
      url: requestUrl,
      method: 'GET',
      headers: getDefaultRequestHeader(),
      success: success,
      error: failed
    });
  });

  const searchVenues = (category, sw, ne) => new Promise((resolve, reject) => {
    const success = response => {
      if (response.meta.code === 200) {
        resolve(response.response.venues);
      } else {
        reject('Error');
      }
    };

    const error = error => {
      console.error(error);
      reject(error);
    }

    const url = createApiUrl('https://api.foursquare.com/v2/venues/search', {
      intent: 'browse',
      sw: `${sw.lat},${sw.lng}`,
      ne: `${ne.lat},${ne.lng}`,
      categoryId: category
    });

    $.ajax({
      url: url,
      method: 'GET',
      headers: getDefaultRequestHeader(),
      success: success,
      error: error
    });
  });

  const createListItem = venue => $(`<li><a href="venue.html?id=${venue.id}">`
    + `<img src="${getVenueIcon(venue, 88, false)}" class="listview-img">`
    + `<h3>${venue.name}</h3>`
    + `<p><strong>${venue.categories.map(c => c.name).join(', ')}</strong></p>`
    + '</a></li>');

  const updateHomeList = () => {
    const $venuesList = $('#venues-list');
    $venuesList.find('li').remove();
    if (!data.global.exploreResults) {
      return;
    }

    const venues = getRecommendedVenues();
    $.each(venues, (index, venue) => {
      $venuesList.append(createListItem(venue));
    });
    $venuesList.listview('refresh');
  };

  const getDefaultMapLayer = () => L.tileLayer(`https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=${CONFIG.MAPBOX_ACCESS_TOKEN}`, {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox.streets',
    accessToken: CONFIG.MAPBOX_ACCESS_TOKEN
  });

  const getVenueIcon = (venue, size = 32, bg = false) => {
    const primaryCategories = venue.categories.filter(c => c.primary);
    if (!primaryCategories.length) {
      return null;
    }
    return primaryCategories[0].icon.prefix + (bg ? 'bg_' : '') +
      size.toString() + primaryCategories[0].icon.suffix;
  };

  const getVenueMarker = venue => {
    const marker = L.marker([venue.location.lat, venue.location.lng], {
      icon: L.icon({
        iconUrl: getVenueIcon(venue, 32),
        iconSize: [32, 32],
        shadowUrl: 'images/icon-bg.svg',
        shadowSize: [32, 32]
      })
    });
    marker.bindPopup(`<h3>${venue.name}</h3>`
      + `<a href="venue.html?id=${venue.id}">View Detail »</a>`, {
      maxWidth: 200
    });
    return marker;
  };

  const updateMarkers = () => {
    if (!data.map.map) {
      return;
    }
    if (data.map.markersGroup) {
      data.map.map.removeLayer(data.map.markersGroup);
      data.map.markersGroup = null;
    }

    const markers = [];
    for (let i = 0; i < data.map.venues.length; i++) {
      const venue = data.map.venues[i];
      markers.push(getVenueMarker(venue));
    }
    data.map.markersGroup = new L.featureGroup(markers);
    data.map.map.addLayer(data.map.markersGroup);
  };

  const updateMapExplore = async() => {
    const category = $('#map-category').val();
    const mapBounds = data.map.map.getBounds();
    const sw = mapBounds.getSouthWest();
    const ne = mapBounds.getNorthEast();
    data.map.venues = await searchVenues(category, sw, ne);
    updateMarkers();
  };

  const pageShowMap = () => {
    data.map.map = L.map('map-map', {
      center: [data.global.myLocation.lat, data.global.myLocation.lng],
      zoom: 14
    });

    data.map.map.addLayer(getDefaultMapLayer());

    data.map.map.on('moveend', () => { !data.map.popupShown && updateMapExplore(); });
    data.map.map.on('popupopen', () => { data.map.popupShown = true; });
    data.map.map.on('popupclose', () => { data.map.popupShown = false; });
    $('#map-category').change(updateMapExplore);

    updateMapExplore();
  };

  const pageBeforeHideMap = () => {
    if (data.map.map) {
      data.map.map.remove();
    }

    data.map.map = null;
    data.map.markersGroup = null;
    data.map.venues = [];
    data.map.popupShown = false;
  };

  const init = async() => {
    try {
      $.mobile.loading('show');
      data.global.myLocation = await getLocationFromIP();
      data.global.exploreResults = await exploreVenues(data.global.myLocation.lat, data.global.myLocation.lng);
      updateHomeList();
      $.mobile.loading('hide');
    } catch (error) {
      console.error(error);
      $.mobile.loading('hide');
    }
  };

  $(document).on('pageshow', '#map', pageShowMap);
  $(document).on('pagebeforehide', '#map', pageBeforeHideMap);

  init();
});
