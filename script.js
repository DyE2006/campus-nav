// Step 1: Create map locked on RSU
var rsuCenter = [4.799, 6.980];
var map = L.map('map', {
  zoomControl: true,
  center: rsuCenter,
  zoom: 16
});

// Step 2: Load map background
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Step 3: Load locations from JSON and add emoji markers
fetch('locations.json')
  .then(function(response) {
    return response.json();
  })
  .then(function(locations) {
    locations.forEach(function(location) {
      var emojiIcon = L.divIcon({
        html: location.emoji,
        className: 'emoji-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      var marker = L.marker([location.lat, location.lng], { icon: emojiIcon })
        .addTo(map)
        .bindPopup(
          '<div class="popup-content">' +
          '<img src="' + location.image + '" alt="' + location.name + '" class="popup-img" onerror="this.style.display=\'none\'">' +
          '<b>' + location.emoji + ' ' + location.name + '</b><br>' +
          location.description +
          '</div>'
        );
      marker.on('click', function() {
        map.flyTo([location.lat, location.lng], 18);
        lastClickedLocation = location;
      });
    });
  });

// Step 4: Auto drop user pin on page load
var userMarker = null;
var userLatLng = null;
var routeControl = null;
var lastClickedLocation = null;

function locateUser() {
  navigator.geolocation.getCurrentPosition(function(position) {
    userLatLng = [position.coords.latitude, position.coords.longitude];

    if (userMarker) {
      map.removeLayer(userMarker);
    }

    userMarker = L.marker(userLatLng)
      .addTo(map)
      .bindPopup('👤 You are here');

  }, function() {
    console.log('Location access denied or unavailable.');
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

// Try locating immediately on load
locateUser();

// ── Collapsible toolbar ──
function collapseToolbar() {
  document.getElementById('toolbar').classList.add('collapsed');
  document.getElementById('toolbar-toggle').textContent = '▼  Show Search';
}

function expandToolbar() {
  document.getElementById('toolbar').classList.remove('collapsed');
  document.getElementById('toolbar-toggle').textContent = '▲  Hide Search';
}

document.getElementById('toolbar-toggle').addEventListener('click', function() {
  var toolbar = document.getElementById('toolbar');
  toolbar.classList.contains('collapsed') ? expandToolbar() : collapseToolbar();
});

// Step 5: Find Me button
document.getElementById('findMeBtn').addEventListener('click', function() {
  if (userLatLng) {
    map.flyTo(userLatLng, 17);
  } else {
    alert('Your location is not available. Please allow location access.');
  }
});

// Step 6: Search functionality
document.getElementById('searchBtn').addEventListener('click', function() {
  var startQuery = document.getElementById('startInput').value.trim().toLowerCase();
  var destQuery = document.getElementById('destinationInput').value.trim().toLowerCase();
  var startNoSpace = startQuery.replace(/\s+/g, '');
  var destNoSpace = destQuery.replace(/\s+/g, '');

  if (!startQuery && !destQuery) {
    alert('Please enter at least a destination.');
    return;
  }

  fetch('locations.json')
    .then(function(response) { return response.json(); })
    .then(function(locations) {

      var destLocation = null;
      if (destQuery) {
        destLocation = locations.find(function(location) {
          var nameNoSpace = location.name.toLowerCase().replace(/\s+/g, '');
          var nameMatch = location.name.toLowerCase().includes(destQuery) || nameNoSpace.includes(destNoSpace);
          var keywordMatch = location.keywords.some(function(keyword) {
            return keyword.toLowerCase().includes(destQuery) || keyword.toLowerCase().replace(/\s+/g, '').includes(destNoSpace);
          });
          return nameMatch || keywordMatch;
        });

        if (!destLocation) {
          alert('Destination not found. Please check the name and try again.');
          return;
        }
      }

      var startLocation = null;
      if (startQuery) {
        startLocation = locations.find(function(location) {
          var nameNoSpace = location.name.toLowerCase().replace(/\s+/g, '');
          var nameMatch = location.name.toLowerCase().includes(startQuery) || nameNoSpace.includes(startNoSpace);
          var keywordMatch = location.keywords.some(function(keyword) {
            return keyword.toLowerCase().includes(startQuery) || keyword.toLowerCase().replace(/\s+/g, '').includes(startNoSpace);
          });
          return nameMatch || keywordMatch;
        });

        if (!startLocation) {
          alert('Start location not found. Please check the name or leave empty to use your current location.');
          return;
        }
      }

      if (!startQuery && destLocation) {
        flyToLocation(destLocation);
        return;
      }

      if (startLocation && !destQuery) {
        flyToLocation(startLocation);
        return;
      }

      if (startLocation && destLocation) {
        var start = [startLocation.lat, startLocation.lng];
        var end = [destLocation.lat, destLocation.lng];
        drawRoute(start, end);
        return;
      }

      if (!startQuery && destLocation) {
        if (!userLatLng) {
          alert('Your location is not available. Please click Find Me first or enter a start location.');
          return;
        }
        destinationCoords = [destLocation.lat, destLocation.lng];
        drawRoute(userLatLng, destinationCoords);
        startTracking();
      }
    });
});

function flyToLocation(location) {
  map.flyTo([location.lat, location.lng], 18);

  var emojiIcon = L.divIcon({
    html: location.emoji,
    className: 'emoji-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  var marker = L.marker([location.lat, location.lng], { icon: emojiIcon })
    .addTo(map)
    .bindPopup(
      '<div class="popup-content">' +
      '<img src="' + location.image + '" alt="' + location.name + '" class="popup-img" onerror="this.style.display=\'none\'">' +
      '<b>' + location.emoji + ' ' + location.name + '</b><br>' +
      location.description +
      '</div>'
    )
    .openPopup();

  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
  stopTracking();
  destinationCoords = null;
  hideCancelBtn();
}

document.getElementById('destinationInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    document.getElementById('searchBtn').click();
  }
});

document.getElementById('startInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    document.getElementById('searchBtn').click();
  }
});

// Step 7: Routing with live tracking
var watchId = null;
var destinationCoords = null;

document.getElementById('routeBtn').addEventListener('click', function() {
  var query = document.getElementById('destinationInput').value.trim().toLowerCase();
  var queryNoSpace = query.replace(/\s+/g, '');

  if (lastClickedLocation && !query) {
    if (!userLatLng) {
      alert('Please click Find Me first so we know your location!');
      return;
    }
    destinationCoords = [lastClickedLocation.lat, lastClickedLocation.lng];
    drawRoute(userLatLng, destinationCoords);
    startTracking();
    return;
  }

  if (!query) {
    alert('Please enter a destination or click a location on the map first.');
    return;
  }

  if (!userLatLng) {
    alert('Your location is not available. Please allow location access.');
    return;
  }

  fetch('locations.json')
    .then(function(response) { return response.json(); })
    .then(function(locations) {
      var found = locations.find(function(location) {
        var nameNoSpace = location.name.toLowerCase().replace(/\s+/g, '');
        var nameMatch = nameNoSpace.includes(queryNoSpace);
        var keywordMatch = location.keywords.some(function(keyword) {
          return keyword.toLowerCase().replace(/\s+/g, '').includes(queryNoSpace);
        });
        return nameMatch || keywordMatch;
      });

      if (found) {
        destinationCoords = [found.lat, found.lng];
        drawRoute(userLatLng, destinationCoords);
        startTracking();
      } else {
        alert('Location not found. Try searching for Faculty of Law, ICTC, Senate Building etc.');
      }
    });
});

// Single drawRoute function
function drawRoute(start, end) {
  if (routeControl) {
    map.removeControl(routeControl);
  }

  routeControl = L.Routing.control({
    waypoints: [
      L.latLng(start[0], start[1]),
      L.latLng(end[0], end[1])
    ],
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    lineOptions: {
      styles: [
        { color: '#1a6b3c', weight: 6, opacity: 0.8 }
      ]
    }
  }).addTo(map);

  routeControl.on('routesfound', function(e) {
    var bounds = L.latLngBounds(e.routes[0].coordinates);
    map.fitBounds(bounds, { padding: [50, 50] });

    setTimeout(function() {
      var container = document.querySelector('.leaflet-routing-container');
      if (container && !document.getElementById('toggleDirections')) {
        var toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggleDirections';
        toggleBtn.innerHTML = '✕ Hide';
        toggleBtn.addEventListener('click', function() {
          container.classList.toggle('collapsed');
          toggleBtn.innerHTML = container.classList.contains('collapsed') ? '☰ Directions' : '✕ Hide';
        });
        container.appendChild(toggleBtn);
      }
    }, 500);
  });

  collapseToolbar();
  showCancelBtn();
}

function showCancelBtn() {
  document.getElementById('cancelRouteBtn').style.display = 'block';
}

function hideCancelBtn() {
  document.getElementById('cancelRouteBtn').style.display = 'none';
}

document.getElementById('cancelRouteBtn').addEventListener('click', function() {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
  stopTracking();
  destinationCoords = null;
  lastClickedLocation = null;
  expandToolbar();
  hideCancelBtn();
});

function startTracking() {
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(function(position) {
    var newLat = position.coords.latitude;
    var newLng = position.coords.longitude;
    userLatLng = [newLat, newLng];

    if (userMarker) {
      userMarker.setLatLng(userLatLng);
    }

    if (destinationCoords) {
      var distance = map.distance(userLatLng, destinationCoords);

      if (distance < 20) {
        alert('🎉 You have arrived at your destination!');
        stopTracking();

        if (routeControl) {
          map.removeControl(routeControl);
          routeControl = null;
        }
        destinationCoords = null;
      } else if (routeControl) {
        routeControl.setWaypoints([
          L.latLng(userLatLng[0], userLatLng[1]),
          L.latLng(destinationCoords[0], destinationCoords[1])
        ]);
      }
    }
  }, function() {
    console.log('Tracking error or permission denied.');
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  });
}

function stopTracking() {
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// ── CHATBOT ──
document.addEventListener('DOMContentLoaded', function() {

  document.getElementById('swapBtn').addEventListener('click', function() {
    var startVal = document.getElementById('startInput').value;
    var destVal = document.getElementById('destinationInput').value;
    document.getElementById('startInput').value = destVal;
    document.getElementById('destinationInput').value = startVal;
  });

  document.getElementById('chatbot-btn').addEventListener('click', function() {
    var container = document.getElementById('chatbot-container');
    container.style.display = container.style.display === 'flex' ? 'none' : 'flex';
    if (container.style.display === 'flex') {
      addBotMessage("Hi! 👋 I'm your RSU Navigation Assistant. Ask me about any location on campus or use the quick buttons below!, You could also tap list to show all available locations");
    }
  });

  document.getElementById('chatbot-close').addEventListener('click', function() {
    document.getElementById('chatbot-container').style.display = 'none';
  });

  function addBotMessage(text) {
    var messages = document.getElementById('chatbot-messages');
    var msg = document.createElement('div');
    msg.className = 'bot-message';
    msg.innerHTML = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function addUserMessage(text) {
    var messages = document.getElementById('chatbot-messages');
    var msg = document.createElement('div');
    msg.className = 'user-message';
    msg.textContent = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function addDirectionsBtn(location) {
    var messages = document.getElementById('chatbot-messages');
    var btn = document.createElement('button');
    btn.className = 'chat-directions-btn';
    btn.textContent = '🧭 Get Directions to ' + location.name;
    btn.addEventListener('click', function() {
      if (!userLatLng) {
        addBotMessage("⚠️ I can't find your location. Please click Find Me first!");
        return;
      }
      destinationCoords = [location.lat, location.lng];
      drawRoute(userLatLng, destinationCoords);
      document.getElementById('chatbot-container').style.display = 'none';
    });
    messages.appendChild(btn);
    messages.scrollTop = messages.scrollHeight;
  }

  function processQuery(query) {
    var q = query.toLowerCase().trim();
    var qNoSpace = q.replace(/\s+/g, '');

    if (q.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
      addBotMessage("Hello! 👋 Welcome to RSU Campus Navigation. How can I help you today?");
      return;
    }

    if (q.includes('help') || q.includes('what can you do')) {
      addBotMessage("I can help you with: <br>🔍 Finding locations on campus<br>🧭 Getting directions<br>ℹ️ Information about buildings<br>📋 Listing all available locations<br><br>Just type a location name or use the quick buttons below!");
      return;
    }

    if (q.includes('thank') || q.includes('thanks')) {
      addBotMessage("You're welcome! 😊 Stay safe on campus!");
      return;
    }

    if (q.match(/^(no|nope|nevermind|never mind|cancel|exit|stop|okay|ok|fine)/)) {
      addBotMessage("Okay! 😊 Let me know if you need anything else.");
      return;
    }

    if (q.includes('all locations') || q.includes('what locations') || q.includes('available locations') || q.includes('show locations') || q.includes('list')) {
      fetch('locations.json')
        .then(function(response) { return response.json(); })
        .then(function(locations) {
          var list = locations.map(function(l) {
            return l.emoji + ' ' + l.name;
          }).join('<br>');
          addBotMessage('Here are all available locations on campus:<br><br>' + list);
        });
      return;
    }

    fetch('locations.json')
      .then(function(response) { return response.json(); })
      .then(function(locations) {
        var found = locations.find(function(location) {
          var nameNoSpace = location.name.toLowerCase().replace(/\s+/g, '');
          var nameMatch = location.name.toLowerCase().includes(q) || nameNoSpace.includes(qNoSpace);
          var keywordMatch = location.keywords.some(function(keyword) {
            return keyword.toLowerCase().includes(q) || keyword.toLowerCase().replace(/\s+/g, '').includes(qNoSpace);
          });
          return nameMatch || keywordMatch;
        });

        if (found) {
          addBotMessage(
            '<img src="' + found.image + '" alt="' + found.name + '" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;display:block;" onerror="this.style.display=\'none\'">' +
            '<b>' + found.emoji + ' ' + found.name + '</b><br>' + found.description
          );
          addDirectionsBtn(found);
          map.flyTo([found.lat, found.lng], 18);
        } else {
          var fuzzy = null;
          if (qNoSpace.length >= 3) {
            fuzzy = locations.find(function(location) {
              var allTerms = [location.name, ...location.keywords];
              return allTerms.some(function(term) {
                var termNoSpace = term.toLowerCase().replace(/\s+/g, '');
                return termNoSpace.includes(qNoSpace);
              });
            });
          }

          if (fuzzy) {
            addBotMessage('Did you mean <b>' + fuzzy.emoji + ' ' + fuzzy.name + '</b>?<br>' + fuzzy.description);
            addDirectionsBtn(fuzzy);
          } else {
            addBotMessage("Sorry, I couldn't find that location 🗺️<br>Try typing <b>'list'</b> to see all available locations, or ask about Faculty of Science, ICTC, Library, Main Gate etc.");
          }
        }
      });
  }

  document.getElementById('chatbot-send').addEventListener('click', function() {
    var input = document.getElementById('chatbot-input');
    var query = input.value.trim();
    if (!query) return;
    addUserMessage(query);
    input.value = '';
    processQuery(query);
  });

  document.getElementById('chatbot-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      document.getElementById('chatbot-send').click();
    }
  });

  document.querySelectorAll('.suggestion-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var query = btn.textContent.replace(/[^\w\s]/g, '').trim();
      addUserMessage(btn.textContent);
      processQuery(query);
    });
  });

  // User Guide
  document.getElementById('guideBtn').addEventListener('click', function() {
    document.getElementById('guide-modal').style.display = 'block';
    document.getElementById('guide-overlay').style.display = 'block';
  });

  document.getElementById('guide-close').addEventListener('click', function() {
    document.getElementById('guide-modal').style.display = 'none';
    document.getElementById('guide-overlay').style.display = 'none';
  });

  document.getElementById('guide-overlay').addEventListener('click', function() {
    document.getElementById('guide-modal').style.display = 'none';
    document.getElementById('guide-overlay').style.display = 'none';
  });

});