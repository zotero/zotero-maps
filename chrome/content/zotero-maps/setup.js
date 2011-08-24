Zotero.Maps = {
    SCHEME: "zotero://maps",
    
    channel: {
        CONTENT_URI: "chrome://zotero-maps/content/ui.html",
        newChannel: function (uri) {
            var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                                      .getService(Components.interfaces.nsIIOService);
            try {
                var ext_uri = ioService.newURI(this.CONTENT_URI, null, null);
                var extChannel = ioService.newChannelFromURI(ext_uri);
                return extChannel;
            }
            catch (e){
                Zotero.debug(e);
                throw (e);
            }
        }
    },

    loaded: false,

    DB: null,
    
    init: function () {
        var protocol = Components.classes["@mozilla.org/network/protocol;1?name=zotero"]
                                 .getService(Components.interfaces.nsIProtocolHandler)
                                 .wrappedJSObject;
        protocol._extensions[this.SCHEME] = this.channel;

        this.DB = new Zotero.DBConnection('zotero-maps');
        
        if (!this.DB.tableExists('cache')) {
            this.DB.query("CREATE TABLE cache " +
                          " (lng NUMERIC, lat NUMERIC, name VARCHAR(255))");
        }

        // Register the callback in Zotero as an item observer
        var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['item']);
        
        // Unregister callback when the window closes (important to avoid a memory leak)
        window.addEventListener('unload', function(e) {
            Zotero.Notifier.unregisterObserver(notifierID); }, false);
    },

    get: function (loc) {
        var place = loc.replace("\"", "\\\"");
        return this.DB.rowQuery("SELECT * FROM cache WHERE name = \"" + place + "\"");
    },

    set: function (loc, lng, lat) {
        if (!this.get(loc)) {
            /* this is workaround for an apparent bug where passing a
             * float to a placeholder casts it to an integer?? */
            var place = loc.replace("\"", "\\\"");
            this.DB.query("INSERT INTO cache (lng,lat,name) VALUES " +
                            "(" + lng + "," + lat + ", \"" + place + "\")");
        }
    },

    query: function (item, placename, callback) {
        var url='http://zotero.ws.geonames.org/search';
        var q = '?q='+placename+'&maxRows=1&type=json';
        OpenLayers.loadURL(url, q, item, function (req) {
            Zotero.Maps.query_callback(req, item, placename, callback) });
    },

    json_format: new OpenLayers.Format.JSON(),

    query_callback: function (req, item, placename, callback) {
        try {
            // TODO: give a nice message if the webservice is down (timeouts are too long)
            var json = Zotero.Maps.json_format.read(req.responseText);
            var geoname;
            if(json && json.totalResultsCount > 0) {
                geoname = json.geonames[0];
                /* Store the geonames result in the cache for later reuse.
                 * The geonames service may return a different place name than
                 * the one given; if so, cache that, too. */
                this.set(placename, geoname.lng, geoname.lat);
                if (geoname.name != placename) {
                    this.set(geoname.name, geoname.lng, geoname.lat);
                }
                if (callback != null){
                    callback(item, geoname);
                }
            } else {
                /* Cache the place name as unknown so that we don't
                 * keep hammering the geocoder. */
                this.set(placename, 0.0, 0.0);
                geoname = "UNKNOWN";
                callback(item, geoname);
            }
        } catch (e) {
            alert(e);
        }
    },
   	
    // Callback implementing the notify() method to pass to the Notifier
    notifierCallback: {
        notify: function(event, type, ids, extraData) {
            if (event == 'add' || event == 'modify') {
                // Retrieve the added/modified items as Item objects
                var items = Zotero.Items.get(ids);
                for each(var item in items) {
                    var placename = item.getField("place");
                    if (placename && !Zotero.Maps.get(placename)) {
                        Zotero.Maps.query(item, placename);
                        }
                }
            }
        }
    },
 
    load: function() {
        var uri = "";
        var id = ZoteroPane.getSelectedItems(true);
        if (id != "") { 
            uri = this.SCHEME + '/selection/'
        } else{ 
            id = ZoteroPane.getSelectedCollection(true);
            if (id) {
                uri = this.SCHEME + '/collection/' + id;
            } else { 
                id = ZoteroPane.getSelectedSavedSearch(true);
                if (id) {
                    uri = this.SCHEME + '/search/' + id;
                } else {
                    uri = this.SCHEME + '/library/';
                }
            }
        } 
        if (uri) {
        	if(Zotero.isStandalone) {
        		ZoteroStandalone.openInViewer(uri);
        	} else {
	            window.loadURI(uri);
	        }
        } else {
            // var str = document.getElementById('zotero-maps-strings')
            //                  .getFormattedString("zoteromaps.noneSelected");
            var str = "No collection is selected.";
            alert(str);
        }
    },

    selection: function () {
        return ZoteroPane.getSelectedItems(true);
    }
};

window.addEventListener('load', function(e) { Zotero.Maps.init(); }, false);
