
// Tizen Remote Keys
const KEY = {
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    ENTER: 13,
    RETURN: 10009,
    EXIT: 10182,
    PLAY: 415,
    PAUSE: 19,
    STOP: 413
};

// Map standard browser keys if debugging on PC
if (!window.tizen) {
    // These match standard keyboard arrows and enter
}

$(document).ready(function () {
    // Initial focus
    let $focusable = $('.focusable');
    if ($focusable.length > 0) {
        $focusable.first().addClass('focused').focus();
    }

    $(document).on('keydown', function (e) {
        const code = e.keyCode;
        const $current = $('.focused');
        let $next = null;

        //console.log("Key pressed:", code);

        switch (code) {
            case KEY.LEFT:
                // Logic to find nearest element to the left
                // For this simple UI, we can just prev() if inline, or custom logic
                $next = $current.prev('.focusable');
                if ($next.length === 0) {
                    // Try moving to previous container/group if applicable
                }
                break;
            case KEY.RIGHT:
                $next = $current.next('.focusable');
                break;
            case KEY.UP:
                // specialized logic for vertical stack
                // finding element with same 'left' offset or strictly above
                $next = findClosest($current, 'up');
                break;
            case KEY.DOWN:
                $next = findClosest($current, 'down');
                break;
            case KEY.ENTER:
                $current.trigger('click');
                break;
            case KEY.RETURN:
                console.log("Return/Back key pressed");
                if (window.App && window.App.handleBack) {
                    window.App.handleBack();
                }
                break;
            case KEY.PLAY:
                console.log("Play key pressed");
                break;
            // Add other media keys...
        }

        if ($next && $next.length > 0) {
            $('.focused').removeClass('focused');
            $next.addClass('focused').focus();
            ensureVisible($next);
            e.preventDefault();
        }
    });

    // Ensure the focused element is visible within its scrollable container
    function ensureVisible($el) {
        const $container = $el.closest('.list-container');
        if ($container.length === 0) return;

        const container = $container[0];
        const el = $el[0];

        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elTop = el.offsetTop - container.offsetTop; // Relative to container
        const elBottom = elTop + el.clientHeight;

        // Scroll Down
        if (elBottom > containerBottom) {
            container.scrollTop = elBottom - container.clientHeight;
        }
        // Scroll Up
        if (elTop < containerTop) {
            container.scrollTop = elTop;
        }
    }

    // Simple nearest neighbor logic for vertical/grid navigation
    function findClosest($current, direction) {
        const API = {
            up: { prop: 'top', func: (a, b) => a < b, multiplier: -1 },
            down: { prop: 'top', func: (a, b) => a > b, multiplier: 1 }
        };

        if (direction === 'left' || direction === 'right') return $(); // Handled simply above

        if ($current.length === 0) return $();

        const currentRect = $current[0].getBoundingClientRect();
        const currentCenter = currentRect.left + currentRect.width / 2;

        let $best = $();
        let bestDist = Infinity;

        $('.focusable').each(function () {
            if (this === $current[0]) return;

            const rect = this.getBoundingClientRect();
            const center = rect.left + rect.width / 2;

            // Check vertical direction
            const isDirection = API[direction].func(rect.top, currentRect.top);
            if (!isDirection) return;

            // Calculate distance
            const vertDist = Math.abs(rect.top - currentRect.top);
            const horizDist = Math.abs(center - currentCenter);
            const dist = Math.sqrt(vertDist * vertDist + horizDist * horizDist);

            if (dist < bestDist) {
                bestDist = dist;
                $best = $(this);
            }
        });

        return $best;
    }

    // Mouse hover support for hybrid (Magic remote)
    $('.focusable').on('mouseenter', function () {
        $('.focused').removeClass('focused');
        $(this).addClass('focused').focus();
    });
});
