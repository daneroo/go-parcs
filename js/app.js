$(function(){
  // console.log('jQuery ready');
  App.init();
})
App = (function () {
    "use strict";
    
    var GMap = google.maps,
        GMarker = GMap.Marker,
        GEvent = GMap.event,
        GLatLng = GMap.LatLng,
        customIcons = {
            parc: {
                icon: 'images/mm_20_green.png' ,
                shadow: 'images/mm_20_shadow.png'
            },
          
            other: {
                icon: 'images/mm_20_green.png',
                shadow: 'images/mm_20_shadow.png'
            }
        },
        focusedMarker = null,
        activeMarkers = [],
        activeFilters = {
            sectors: {},
            installations: {}
        },
        cachedMarkers = null,
        searchInput, map, infoWindow, markerClusterer;
    
    function clientFilter(markers,callback){
      // console.log('-----')
      // console.log('clientFilter activeFilters',JSON.stringify(activeFilters,null));
      var filteredMarkers=[],
           hasSectorFilter = Object.keys(activeFilters.sectors).length;
      
      $.each(markers,function(i,marker){
        
        // filter each marker against active Filters
        var reject = hasSectorFilter;
        
        $.each(activeFilters.sectors, function(sector, _ignore) {
          if (marker.sector == sector) {
            return (reject = false);
          }
        });
        
        $.each(activeFilters.installations,function(installation,_ignore){
          // console.log('testing installation',i,installation);
          if (!marker.hasInstalltion[installation]){
            reject=true;
            return false;// break the foreach loop
          }
        });
        
        // if (Math.random()>.5) filteredMarkers.push(marker);
        if (!reject) filteredMarkers.push(marker);
      });
      // console.log('filtered markers',filteredMarkers.length);
      callback(filteredMarkers,200);
    }
    function sortHashKeys(hash){
      var sorted=[]
      $.each(hash,function(key){
        sorted.push(key);
      });
      sorted.sort();
      return sorted;
    }
    function firstInit(markers){
      var allSectors={};
      var allInstallations={};
      $.each(markers,function(i,marker){
        allSectors[marker.sector]=true;
        // tokenize installations
        if (!marker.hasInstalltion){
          marker.hasInstalltion={}
          var installations = marker.installations.split(/\s*,\s*/);
          $.each(installations,function(i,installation){
            allInstallations[installation]=true;
            marker.hasInstalltion[installation]=true;
          });
        }        
      });
      
      // sort and insert sector checkboxes
      var sortedSectors=sortHashKeys(allSectors);
      var $sector=$('#sectors');
      $.each(sortedSectors,function(i,sector){
        console.log('sector',i,sector);
        $sector.append($('<input type="checkbox" name="sector" value="'+sector+'"/> <span>'+sector+'</span>'))
      });

      // sort and insert installation checkboxes
      var sortedInstallations=sortHashKeys(allInstallations);
      var $trows=$();
      var $tr=null;
      $.each(sortedInstallations,function(i,installation){
        if ((i%6)==0) { $tr = $('<tr />'); $trows = $trows.add($tr); }
        console.log('installation',i,installation);
        // <td><input type="checkbox" name="installation" value="Aréna"/> Aréna</td>
        $tr.append($('<td><input type="checkbox" name="installation" value="'+installation+'"/> '+installation+'</td>'))
      });
      var $installationsTbl=$('#installations table');
      $installationsTbl.append($trows);
    }
    function getMarkers(criterias, callback) {
        criterias = criterias || '';
        
        /* previous server side - php criteria filtering 
        ajax('php/markers.php?' + criterias, function (request, status) {  
            callback(JSON.parse(request.responseText), status);
        });
        */
        if (cachedMarkers){
          // console.log('markers are cached');
          clientFilter(cachedMarkers,callback);
        } else {
          
          $.getJSON('data/markers.json',function(data){
            cachedMarkers=data;
            firstInit(cachedMarkers);
            clientFilter(cachedMarkers,callback);
          });
        }
    }
    
    function onMarkerClick() {
        var data = this._data;
        
        if (focusedMarker) {
            focusedMarker.setAnimation(null);
        }
        
        focusedMarker = this;
        
        infoWindow.setContent([
            '<b>', data.name, '</b><br>',
            data.address, '<br>',
            data.installations
        ].join(''));
        
        infoWindow.open(map, this);
        
        setTimeout(function () {
            focusedMarker.setAnimation(GMap.Animation.BOUNCE);
        }, 0);
    }
    
    function addMarkers(markers) {
        var mapMarker, marker, icon;
         
        for (var i = 0, len = markers.length; i < len; i++) {
            
            mapMarker = new GMarker({
                position: new GLatLng(
                    parseFloat((marker = markers[i]).lat),
                    parseFloat(marker.lng)
                ),
                icon: (icon = customIcons[marker.type] || {}).icon,
                shadow: icon.shadow
            });
            
            activeMarkers.push(mapMarker);
            
            mapMarker._data = marker;
            
            GEvent.addListener(mapMarker, 'click', onMarkerClick);
        }
        
        markerClusterer.addMarkers(activeMarkers);
    }
    
    function removeAllMarkers() {
        var i = activeMarkers.length - 1,
            marker;
        
        markerClusterer.clearMarkers();
        
        while (i >= 0) {
            marker = activeMarkers[i];
            GEvent.clearInstanceListeners(marker); //TODO: Is this needed since we used clearMarkers?
            activeMarkers.splice(i, 1);
            i--;
        }
    }
    
    function onMarkersLoad(markers, status) {
        if (status !== 200) {
            //TODO: Handle error
            return;
        }
        
        addMarkers(markers);
    }
    
    function filterMarkers(criterias) {
        removeAllMarkers();
        getMarkers(criterias, onMarkersLoad);
    }
    
    function updateFilter(type, id, clear) {
        type = type + 's';
        
        if (clear) {
            delete activeFilters[type][id];
        } else {
            activeFilters[type][id] = true;
        }
    }
    
    function installDOMListeners() {
        
        on(document, 'click', function (e) {
            var target = e.target;
            
            if (!target || target.type !== 'checkbox') {
                return;
            }
            
            updateFilter(target.name, target.value, !target.checked);
            
            filterMarkers(buildCriterias());
        });
        
        //TODO: Free-text filterMarkers function
        /*
        on(searchInput, 'keypress', function (e) {
            if (e.keyCode && e.keyCode === 13) {
                filterMarkers(buildCriterias() + '&query=' + searchInput.value);
            }
        });
        */
    }
    
    function buildCriterias() {
        
        var sectors = activeFilters.sectors,
            installations = activeFilters.installations,
            installationsParams = '',
            sectorsParams = '',
            key;
            
        for (key in sectors) {
            sectorsParams += key + ',';
        }
        
        for (key in installations) {
            installationsParams += key + ',';
        }
        
        return encodeURI(
            (installationsParams === ''? '' : 'installations=' + installationsParams.slice(0, -1))
            + (sectorsParams === ''? '' : (installationsParams? '&' : '') + 'sectors=' + sectorsParams.slice(0, -1))
        );
    }
    
    return {
        init: function () {
            
            map = new GMap.Map(document.getElementById("map"), {
                center: new GLatLng(45.486740, -75.633217),
                zoom: 11,
                mapTypeId: 'roadmap'
            });
            
            markerClusterer = new MarkerClusterer(map, [], {
                minimumClusterSize: 10
            });
            
            infoWindow = new GMap.InfoWindow();
            
            GEvent.addListener(infoWindow, 'closeclick', function () {
                focusedMarker.setAnimation(null);
                focusedMarker = null;
            });
            
            filterMarkers('');
            
            //searchInput = document.getElementById('filterMarkers-input');
            
            installDOMListeners();
        }
    };
})();
