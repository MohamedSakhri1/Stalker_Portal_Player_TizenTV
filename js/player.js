const player = {
    avplay: null,

    init() {
        if (window.tizen && window.webapis && window.webapis.avplay) {
            this.avplay = window.webapis.avplay;
        } else {
            console.warn("AVPlay not available (not Tizen?)");
        }
    },

    async play(url, options = {}) {
        if (!this.avplay) {
            console.log("Mock Play (not on Tizen):", url, options);
            return;
        }

        try {
            this.avplay.close(); // Close any valid connection
        } catch (e) { }

        try {
            console.log("AVPlay: open", url);
            this.avplay.open(url);

            // Apply specific Stalker headers if provided
            if (options.headers) {
                if (options.headers["User-Agent"]) {
                    try {
                        this.avplay.setStreamingProperty("USER_AGENT", options.headers["User-Agent"]);
                    } catch (e) {
                        console.warn("Retrying USER_AGENT or ignoring emulator error:", e);
                    }
                }
                if (options.headers["Cookie"]) {
                    try {
                        this.avplay.setStreamingProperty("COOKIE", options.headers["Cookie"]);
                    } catch (e) {
                        console.warn("Retrying COOKIE or ignoring emulator error:", e);
                    }
                }
            }

            // Required for some streams
            this.avplay.setDisplayRect(0, 0, 1920, 1080);
            this.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');

            this.avplay.setListener({
                onbufferingstart: () => {
                    console.log("Buffering start");
                    if (options.onBufferingStart) options.onBufferingStart();
                },
                onbufferingprogress: (percent) => {
                    console.log("Buffering: " + percent);
                    if (options.onBufferingProgress) options.onBufferingProgress(percent);
                },
                onbufferingcomplete: () => {
                    console.log("Buffering complete");
                    if (options.onBufferingComplete) options.onBufferingComplete();
                },
                onstreamcompleted: () => {
                    console.log("Stream Completed");
                    if (options.onStreamCompleted) {
                        options.onStreamCompleted();
                    } else if (options.autoRestart) {
                        console.log("Auto-Restarting stream...");
                        this.stop();
                        setTimeout(() => this.play(url, options), 500);
                    }
                },
                oncurrentplaytime: (time) => { },
                onerror: (e) => {
                    console.error("AVPlay Error", e);
                    if (options.onError) options.onError(e);
                }
            });

            console.log("AVPlay: prepareAsync");
            await this.avplay.prepareAsync(() => {
                console.log("AVPlay: start");
                this.avplay.play();
            }, (e) => {
                console.error("AVPlay Prepare Error", e);
                if (options.onError) options.onError(e);
            });

        } catch (e) {
            console.error("AVPlay Exception", e);
        }
    },

    stop() {
        if (this.avplay) {
            try {
                this.avplay.stop();
                this.avplay.close();
            } catch (e) { }
        }
    },

    pause() {
        if (this.avplay) {
            try { this.avplay.pause(); } catch (e) { console.error("Pause fail", e); }
        } else {
            console.log("Mock Pause");
        }
    },

    resume() {
        if (this.avplay) {
            try { this.avplay.play(); } catch (e) { console.error("Resume fail", e); }
        } else {
            console.log("Mock Resume");
        }
    },

    jumpForward(ms) {
        if (this.avplay) {
            try {
                const current = this.avplay.getCurrentTime();
                this.avplay.seekTo(current + ms);
            } catch (e) {
                console.error("FF fail", e);
            }
        } else {
            console.log(`Mock FF ${ms}ms`);
        }
    },

    jumpBackward(ms) {
        if (this.avplay) {
            try {
                const current = this.avplay.getCurrentTime();
                const target = Math.max(0, current - ms);
                this.avplay.seekTo(target);
            } catch (e) {
                console.error("RW fail", e);
            }
        } else {
            console.log(`Mock RW ${ms}ms`);
        }
    }
};
