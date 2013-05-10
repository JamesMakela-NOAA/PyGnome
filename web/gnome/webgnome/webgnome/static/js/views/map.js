define([
    'jquery',
    'lib/underscore',
    'lib/backbone',
    'models',
    'lib/jquery.imagesloaded.min',
], function($, _, Backbone, models) {

    function MapViewException(message) {
        this.message = message;
        this.name = "MapViewException";
    }

    /*
     `MapView` represents the visual map and is responsible for animating frames
     for each time step rendered by the server
     */
    var MapView = Backbone.View.extend({
        initialize: function() {
            var _this = this;
            _.bindAll(this);
            this.mapEl = this.options.mapEl;
            this.frameClass = this.options.frameClass;
            this.activeFrameClass = this.options.activeFrameClass;
            this.placeholderClass = this.options.placeholderClass;
            this.latLongBounds = this.options.latLongBounds;
            this.animationThreshold = this.options.animationThreshold;
            this.locationFilesMeta = this.options.locationFilesMeta;
            this.canDrawSpill = false;

            this.makeImagesClickable();

            this.state = this.options.state;
            this.listenTo(this.state, 'change:animation', this.animationStateChanged);
            this.listenTo(this.state, 'change:cursor', this.cursorStateChanged);

            this.map = $(this.mapEl);

            this.gnomeRun = this.options.gnomeRun;
            this.gnomeRun.on(models.GnomeRun.NEXT_TIME_STEP_READY, this.nextTimeStepReady);
            this.gnomeRun.on(models.GnomeRun.RUN_BEGAN, this.gnomeRunBegan);
            this.gnomeRun.on(models.GnomeRun.RUN_ERROR, this.gnomeRunError);
            this.gnomeRun.on(models.GnomeRun.RUN_FINISHED, this.gnomeRunFinished);
            this.gnomeRun.on(models.GnomeRun.CREATED, this.reset);

            this.model = this.options.model;
            this.model.on('change:background_image_url', function() {
                _this.reset();
            });
            this.model.on('destroy', function () {
                _this.reset();
                _this.map.empty();
            });

            if (this.gnomeRun.hasCachedTimeStep(this.gnomeRun.getCurrentTimeStep())) {
                this.nextTimeStepReady();
            }

            this.cursorClasses = ['zooming-in', 'zooming-out', 'moving', 'spill'];
        },

        animationStateChanged: function(animationState) {
            switch (animationState) {
                case this.state.animation.STOPPED:
//                    this.setStopped();
                    break;
                case this.state.animation.PLAYING:
//                    this.setPlaying();
                    break;
                case this.state.animation.PAUSED:
//                    this.setPaused();
                    break;
            }
        },

        cursorStateChanged: function(cursorState) {
            this.removeCursorClasses();

            // Unset ability to draw a spill on the map.
            this.unsetSpillCursor();

            switch(cursorState) {
                case models.CursorState.ZOOMING_IN:
                    this.makeActiveImageClickable();
                    this.makeActiveImageSelectable();
                    this.setZoomingInCursor();
                    break;
                case models.CursorState.ZOOMING_OUT:
                    this.makeActiveImageClickable();
                    this.setZoomingOutCursor();
                    break;
                case models.CursorState.RESTING:
                    this.setRegularCursor();
                    break;
                case models.CursorState.MOVING:
                    this.setMovingCursor();
                    break;
                case models.CursorState.DRAWING_SPILL:
                    this.setSpillCursor();
                    break;
            }
        },

        show: function() {
            this.setBackground();
        },

        setBackground: function() {
            var backgroundImageUrl = this.model.get('background_image_url');

            if (backgroundImageUrl) {
                this.loadMapFromUrl(backgroundImageUrl);
            } else {
                this.showPlaceholder();
            }
        },

        showPlaceholder: function() {
            $('.' + this.placeholderClass).removeClass('hidden');
        },

        hidePlaceholder: function() {
            $('.' + this.placeholderClass).addClass('hidden');
        },

        makeImagesClickable: function() {
            var _this = this;
            $(this.mapEl).on('click', 'img', function(event) {
                if ($(this).data('clickEnabled')) {
                    _this.trigger(MapView.MAP_WAS_CLICKED, {
                        x: event.pageX,
                        y: event.pageY
                    });
                }
            });
        },

        makeActiveImageClickable: function() {
            var image = this.getActiveImage();
            image.data('clickEnabled', true);
        },

        makeActiveImageSelectable: function() {
            var _this = this;
            var image = this.getActiveImage();
            image.selectable({
                start: function(event) {
                    _this.startPosition = {x: event.pageX, y: event.pageY};
                },
                stop: function(event) {
                    if (!$(this).selectable('option', 'disabled')) {
                        _this.trigger(MapView.DRAGGING_FINISHED, [
                            _this.startPosition,
                            {x: event.pageX, y: event.pageY}
                        ]);
                    }
                }
            });
        },

        getActiveImage: function() {
            return $(this.mapEl + " > img.active");
        },

        getImageForTimeStep: function(stepNum) {
            return $('img[data-id="' + (stepNum) + '"]');
        },

        timeStepIsLoaded: function(stepNum) {
            var step = this.getImageForTimeStep(stepNum);
            return step && step.length;
        },

        /*
         Show the image for time step with ID `stepNum`.

         Triggers:
            - `MapView.FRAME_CHANGED` after the image has loaded.
         */
        showImageForTimeStep: function(stepNum) {
            var mapImages = this.map.find('img');

            // Show the map div if this is the first image of the run.
            if (mapImages.length === 1) {
                this.map.show();
            }

            var stepImage = this.getImageForTimeStep(stepNum);

            // The image isn't loaded.
            if (stepImage.length === 0) {
                alert("An animation error occurred.");
                console.log('Could not load image for timestep: ' + stepNum);
                return;
            }

            var imagesToHide = mapImages.not(stepImage).not('.background');

            // Hide all images in the map div other than the background and the
            // image for the current step.
            imagesToHide.addClass('hidden');
            imagesToHide.removeClass(this.activeFrameClass);

            stepImage.addClass(this.activeFrameClass);
            stepImage.removeClass('hidden');

            this.trigger(MapView.FRAME_CHANGED);
        },

        /*
         Given the length of time the last timestep request took `requestTime`,
         calculate the timeout value for displaying that step.

         If `requestTime` was less than the threshold, then use the difference
         between the threshold value and `requestTime` as the timeout.
         Otherwise, use a timeout of 0, since the request has taken long enough.
          */
        getAnimationTimeout: function(requestTime) {
            // Get the number of MS the last request took.
            requestTime = requestTime || 0;
            var threshold = this.animationThreshold;
            return requestTime < threshold ? threshold - requestTime : 0;
        },

        addImageForTimeStep: function(timeStep) {
            var _this = this;
            var map = $(this.mapEl);
            var requestTime = timeStep.get('requestTime');

            var img = $('<img>').attr({
                'class': 'frame',
                'data-id': timeStep.id,
                'src': timeStep.get('url')
            }).addClass('hidden');

            img.appendTo(map);

            $(img).imagesLoaded(function() {
                // TODO: Check how much time has passed after next time
                // // step is ready. If longer than N, show the image
                // immediately. Otherwise, set a delay and then show image.

                // TODO: Make the timeout value configurable.
                setTimeout(_this.showImageForTimeStep,
                           _this.getAnimationTimeout(requestTime),
                           [timeStep.id]);
            });
        },

        addTimeStep: function(timeStep) {
            var imageExists = this.getImageForTimeStep(timeStep.id).length;

            // We must be playing a cached model run because the image already
            // exists. In all other cases the image should NOT exist.
            if (imageExists) {
                setTimeout(this.showImageForTimeStep,
                           // Use 0 since this was a cached time step.
                           this.getAnimationTimeout(0),
                           [timeStep.id]);
                return;
            }

            this.addImageForTimeStep(timeStep);
        },

        // Clear out the current frames.
        clear: function(opts) {
            var map = $(this.mapEl);
            opts = opts || {};

            if (opts.clearBackground) {
                map.find('img').remove();
            } else {
                map.find('img').not('.background').remove();
            }
        },

        getBackground: function() {
            return $(this.mapEl).find('img.background')[0];
        },

        getSize: function() {
            var image = $('.background');
            return {height: image.height(), width: image.width()};
        },

        getPosition: function() {
            return this.getActiveImage().position();
        },

        getBoundingBox: function() {
            var pos = this.getPosition();
            var size = this.getSize();

            return [
                {x: pos.left, y: pos.top},
                {x: pos.left + size.width, y: pos.top + size.height}
            ];
        },

        removeCursorClasses: function() {
            for (var i = 0; i < this.cursorClasses.length; i++) {
                var cls = this.cursorClasses[i];
                $(this.mapEl).removeClass(cls);
            }
        },

        setZoomingInCursor: function() {
            $(this.mapEl).addClass('zooming-in-cursor');
        },

        setZoomingOutCursor: function() {
            $(this.mapEl).addClass('zooming-out-cursor');
        },

        setRegularCursor: function() {
            $(this.mapEl).addClass('regular-cursor');
        },

        setMovingCursor: function() {
            $(this.mapEl).addClass('moving-cursor');
        },

        setSpillCursor: function() {
            $(this.mapEl).addClass('spill-cursor');
            this.canDrawSpill = true;
        },

        unsetSpillCursor: function() {
            $(this.mapEl).removeClass('spill-cursor');
            this.canDrawSpill = false;
        },

        getRect: function(rect) {
            var newStartPosition, newEndPosition;

            // Do a shallow object copy, so we don't modify the original.
            if (rect.end.x > rect.start.x || rect.end.y > rect.start.y) {
                newStartPosition = $.extend({}, rect.start);
                newEndPosition = $.extend({}, rect.end);
            } else {
                newStartPosition = $.extend({}, rect.end);
                newEndPosition = $.extend({}, rect.start);
            }

            return {start: newStartPosition, end: newEndPosition};
        },

        // Adjust a selection rectangle so that it fits within the bounding box.
        getAdjustedRect: function(rect) {
            var adjustedRect = this.getRect(rect);
            var bbox = this.getBoundingBox();

            // TOOD: This looks wrong. Add tests.
            if (adjustedRect.start.x > bbox[0].x) {
                adjustedRect.start.x = bbox[0].x;
            }
            if (adjustedRect.start.y < bbox[0].y) {
                adjustedRect.start.y = bbox[0].y;
            }

            if (adjustedRect.end.x < bbox[1].x) {
                adjustedRect.end.x = bbox[1].x;
            }
            if (adjustedRect.end.y > bbox[1].y) {
                adjustedRect.end.y = bbox[1].y;
            }

            return adjustedRect;
        },

        isPositionInsideMap: function(position) {
            var bbox = this.getBoundingBox();
            return (position.x > bbox[0].x && position.x < bbox[1].x &&
                position.y > bbox[0].y && position.y < bbox[1].y);
        },

        isRectInsideMap: function(rect) {
            var _rect = this.getRect(rect);

            return this.isPositionInsideMap(_rect.start) &&
                this.isPositionInsideMap(_rect.end);
        },

        nextTimeStepReady: function() {
            this.addTimeStep(this.gnomeRun.getCurrentTimeStep());
        },

        loadMapFromUrl: function(url) {
            var _this = this;

            this.hidePlaceholder();

            var map = $(this.mapEl);
            map.find('.background').remove();

            var background = $('<img>').attr({
                class: 'background',
                src: url
            });

            background.imagesLoaded(function() {
                _this.createCanvases();
                _this.trigger(MapView.READY);
            });

            background.appendTo(map);
        },

        drawLine: function(ctx, start_x, start_y, end_x, end_y) {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(start_x, start_y);
            ctx.lineTo(end_x, end_y);
            ctx.stroke();
            ctx.closePath();
            ctx.beginPath();
            ctx.closePath();
        },

        drawSpill: function(spill) {
            var ctx = this.backgroundCanvas[0].getContext('2d');
            var startX, startY, startZ, endX, endY, endZ;
            var start = spill.get('start_position');
            var end = spill.get('end_position');

            startX = endX = start[0];
            startY = endY = start[1];
            startZ = endZ = start[2];

            if (!startX) {
                return;
            }

            if (end) {
                endX = end[0];
                endY = end[1];
                endZ = end[2];
            }

            var pixelStart = this.pixelsFromCoordinates({
                lat: startY,
                long: startX
            });

            var pixelEnd = this.pixelsFromCoordinates({
                lat: endY,
                long: endX
            });

            if (startX === endX && startY === endY) {
                pixelEnd.x += 2;
                pixelEnd.y += 2;
            }

            this.drawLine(ctx, pixelStart.x, pixelStart.y, pixelEnd.x, pixelEnd.y);
        },

        clearCanvas: function(canvas) {
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        },

        // Draw a mark on the map for each existing spill.
        drawSpills: function(spills) {
            var _this = this;

            if (!this.backgroundCanvas || !this.foregroundCanvas) {
                return;
            }

            this.clearCanvas(this.backgroundCanvas[0]);
            this.clearCanvas(this.foregroundCanvas[0]);

            if (spills === undefined || !spills.length) {
                return;
            }

            spills.forEach(function(spill) {
                _this.drawSpill(spill);
            });
        },

        /*
         Create a foreground canvas and setup event handlers to capture new
         spills added to the map. This canvas is cleared entirely during line
         additions (as the line position changes) and when the form container
         refreshes.

         TODO: Update canvas sizes when window changes.
         */
        createCanvases: function() {
            var _this = this;
            var background = $(this.mapEl).find('.background');

            if (this.backgroundCanvas) {
                $(this.backgroundCanvas).remove();
            }

            if (this.foregroundCanvas) {
                $(this.foregroundCanvas).remove();
            }

            this.backgroundCanvas = $('<canvas>').attr({
                id: 'canvas-background',
                class: 'drawable-background',
                height: background.height(),
                width: background.width()
            });

            this.foregroundCanvas = $('<canvas>').attr({
                id: 'canvas-foreground',
                class: 'drawable-foreground',
                height: background.height(),
                width: background.width()
            });

            this.foregroundCanvas.mousedown(function(ev) {
                if (!_this.canDrawSpill) {
                    return;
                }

                this.pressed = true;
                if (ev.originalEvent['layerX'] != undefined) {
                    this.x0 = ev.originalEvent.layerX;
                    this.y0 = ev.originalEvent.layerY;
                }
                else {
                    // in IE, we use this property
                    this.x0 = ev.originalEvent.x;
                    this.y0 = ev.originalEvent.y;
                }
            });

            // Event handlers to draw new spills
            this.foregroundCanvas.mousemove(function(ev) {
                if (!this.pressed || !_this.canDrawSpill) {
                    return;
                }
                this.moved = true;
                var ctx = this.getContext('2d');
                var xcurr, ycurr;
                if (ev.originalEvent['layerX'] != undefined) {
                    xcurr = ev.originalEvent.layerX;
                    ycurr = ev.originalEvent.layerY;
                }
                else {
                    // in IE, we use this property
                    xcurr = ev.originalEvent.x;
                    ycurr = ev.originalEvent.y;
                }

                ctx.clearRect(0, 0, this.width, this.height);
                _this.drawLine(ctx, this.x0, this.y0, xcurr, ycurr);
            });

            $(this.foregroundCanvas).mouseup(function(ev) {
                if (!this.pressed || !_this.canDrawSpill) {
                    return;
                }
                var canvas = _this.backgroundCanvas[0];
                var ctx = canvas.getContext('2d');
                var offset = $(this).offset();
                var endX = ev.pageX - offset.left;
                var endY = ev.pageY - offset.top;

                _this.drawLine(ctx, this.x0, this.y0, endX, endY);
                _this.clearCanvas(_this.foregroundCanvas[0]);

                if (this.pressed && this.moved) {
                    var start = _this.coordinatesFromPixels({
                        x: this.x0,
                        y: this.y0
                    });
                    var end = _this.coordinatesFromPixels({
                        x: endX,
                        y: endY
                    });

                    _this.trigger(MapView.SPILL_DRAWN, [start.long, start.lat],
                                  [end.long, end.lat]);
                }
                this.pressed = this.moved = false;
            });

            this.backgroundCanvas.appendTo(map);
            this.foregroundCanvas.appendTo(map);
        },

        gnomeRunBegan: function() {
            this.loadMapFromUrl(this.model.get('background_image_url'));
        },

        gnomeRunError: function() {
            this.state.animation.setStopped();
        },

        gnomeRunFinished: function() {
            this.state.animation.setStopped();
        },

        reset: function() {
            this.clear({clearBackground: true});
            this.setBackground();
        },

        pixelsFromCoordinates: function(point) {
            var size = this.getSize();
            var bounds = this.model.get('map_bounds');

            if (!size.height || !size.width) {
                throw new MapViewException('No current image size detected.');
            }

            if (!bounds) {
                throw new MapViewException('Map is missing boundary data.');
            }

            var minLat = bounds[0][1];
            var minLong = bounds[0][0];
            var maxLat = bounds[1][1];
            var maxLong = bounds[2][0];

            var x = ((point.long - minLong) / (maxLong - minLong)) * size.width;
            var y = ((point.lat - minLat) / (maxLat - minLat)) * size.height;

            // Adjust for different origin
            y = -y + size.height;

            return {x: Math.round(x), y: Math.round(y)};
        },

        coordinatesFromPixels: function(point) {
            var size = this.getSize();
            var bounds = this.model.get('map_bounds');

            if (!size.height || !size.width) {
                throw new MapViewException('No current image size detected.');
            }

            var minLat = bounds[0][1];
            var minLong = bounds[0][0];
            var maxLat = bounds[1][1];
            var maxLong = bounds[2][0];

            // Adjust for different origin
            point.y = -point.y + size.height;

            var lat = (maxLat - minLat) * (point.y / size.height) + minLat;
            var lng = (maxLong - minLong) * (point.x / size.width) + minLong;

            return {lat: lat, long: lng};
        }
    }, {
        // Event constants
        DRAGGING_FINISHED: 'mapView:draggingFinished',
        REFRESH_FINISHED: 'mapView:refreshFinished',
        PLAYING_FINISHED: 'mapView:playingFinished',
        FRAME_CHANGED: 'mapView:frameChanged',
        MAP_WAS_CLICKED: 'mapView:mapWasClicked',
        SPILL_DRAWN: 'mapView:spillDrawn',
        READY: 'mapView:ready'
    });

    return {
        MapViewException: MapViewException,
        MapView: MapView
    }
});