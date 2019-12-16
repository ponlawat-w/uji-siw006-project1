const foursquareV = '20191212';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
    },
    venue: {
      selectedVenue: null,
      tips: [],
      map: null
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

  const getFullDateTimeFromUnixSeconds = timestamp => {
    const date = new Date(timestamp * 1000);
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
      + ` ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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

  const getVenueTips = (venueId) => new Promise((resolve, reject) => {
    const success = response => {
      if (response.meta.code !== 200) {
        reject(response.meta.code);
        return;
      }
      resolve(response.response.tips.items);
    };

    const error = error => {
      console.error(error);
      reject(error);
    };

    $.ajax({
      url: createApiUrl(`https://api.foursquare.com/v2/venues/${venueId}/tips`, {
        sort: 'popular',
        limit: 1
      }),
      method: 'GET',
      success: success,
      error: error
    });
  });

  const createListItem = venue => $(`<li><a href="venue.html?id=${encodeURIComponent(venue.id)}">`
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

  const getCategoryIcon = (category, size = 32, bg = false) =>
    category.icon.prefix
    + (bg ? 'bg_' : '')
    + size.toString()
    + category.icon.suffix;

  const getVenueIcon = (venue, size = 32, bg = false) => {
    const primaryCategories = venue.categories.filter(c => c.primary);
    if (!primaryCategories.length) {
      return null;
    }
    return getCategoryIcon(primaryCategories[0], size, bg);
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
      + `<a href="venue.html?id=${encodeURIComponent(venue.id)}">View Detail »</a>`, {
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

  const getUrlParams = () => {
    let search = window.location.search;
    if (!search) {
      return {};
    }
    search = search.substring(1);
    const obj = {};
    $.each(search.split('&'), (idx, paramStr) => {
      const paramStrSplited = paramStr.split('=');
      if (paramStrSplited.length < 2) {
        return;
      }

      obj[decodeURIComponent(paramStrSplited[0])] = decodeURIComponent(paramStrSplited[1]);
    });

    return obj;
  };

  const searchLocalVenue = id => {
    const venuesFromGlobal = getRecommendedVenues(data.global.exploreResults).filter(v => v.id === id);
    if (venuesFromGlobal.length) {
      return venuesFromGlobal[0];
    }
    const venuesFromMaps = data.map.venues.filter(v => v.id === id);
    if (venuesFromMaps.length) {
      return venuesFromMaps[0];
    }
    return null;
  };

  const propagateVenueCategories = () => {
    const $categories = $('#venue-categories');
    $categories.html('');

    $categories.append($('<li>').attr('data-role', 'list-divider').html('Categories'));
    $.each(data.venue.selectedVenue.categories, (index, category) => {
      $categories.append('<li>'
        + `<img src="${getCategoryIcon(category, 64)}" class="ui-li-icon category-img">`
        + ` ${category.name}`
        + '</li>');
    });

    $categories.listview('refresh');
  };

  const propagateVenueTips = () => {
    const $tips = $('#venue-tips');
    if (!data.venue.tips.length) {
      $tips.hide();
      return;
    }
    $tips.html('');

    $tips.append($('<li>').attr('data-role', 'list-divider').html('Tips'));
    $.each(data.venue.tips, (index, tip) => {
      const fullName = tip.user.firstName + (tip.user.lastName ? ' ' + tip.user.lastName : '');
      const dateTime = getFullDateTimeFromUnixSeconds(tip.createdAt);
      $tips.append('<li>'
        + `<h3 class="no-wrap">${tip.text}</h3>`
        + `<p class="text-right"><small>${fullName} - ${dateTime}</small></p>`
        + '</li>');
    });

    $tips.show();
    $tips.listview('refresh');
  };

  const propagateVenueAddresses = () => {
    const $addresses = $('#venue-addresses');
    $addresses.html(data.venue.selectedVenue.location.formattedAddress.join(', '));
  };

  const propagateVenueInformation = () => {
    if (!data.venue.selectedVenue) {
      return;
    }
    $('.venue-header_name').html(data.venue.selectedVenue.name);
    $('#venue-maps-link').attr('href', creatUrl('http://maps.apple.com/', {
      q: `${data.venue.selectedVenue.location.lat},${data.venue.selectedVenue.location.lng}`,
      z: 14
    }));

    propagateVenueCategories();
    propagateVenueTips();
    propagateVenueAddresses();
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
    data.map.popupShown = false;
  };

  const pageShowVenue = () => {
    data.venue.map = L.map('venue-maps-container', {
      center: [data.venue.selectedVenue.location.lat, data.venue.selectedVenue.location.lng],
      zoom: 14
    });
    data.venue.map.addLayer(getDefaultMapLayer());
    data.venue.map.addLayer(L.marker([data.venue.selectedVenue.location.lat, data.venue.selectedVenue.location.lng]));
  };

  const pageBeforeShowVenue = async() => {
    const params = getUrlParams();
    if (!params.id) {
      $.mobile.changePage('index.html');
    }

    data.venue.selectedVenue = searchLocalVenue(params.id);
    data.venue.tips = [];

    $.mobile.loading('show');
    try {
      data.venue.tips = await getVenueTips(data.venue.selectedVenue.id);
      $.mobile.loading('hide');
    } catch (error) {
      console.error(error);
      $.mobile.loading('hide');
    }

    propagateVenueInformation();
  };

  const pageBeforeHideVenue = () => {
    data.venue.map.remove();
    data.venue.map = null;
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
  $(document).on('pagebeforeshow', '#venue', pageBeforeShowVenue);
  $(document).on('pageshow', '#venue', pageShowVenue);
  $(document).on('pagebeforehide', '#venue', pageBeforeHideVenue);

  init();
});
