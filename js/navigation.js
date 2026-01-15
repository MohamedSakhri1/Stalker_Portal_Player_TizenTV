
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
    PLAY: 415,
    PAUSE: 19,
    STOP: 413,
    CH_UP: 427,
    CH_DOWN: 428
};

// Map standard browser keys if debugging on PC
if (!window.tizen) {
    // These match standard keyboard arrows and enter
}

// Export for App to call after views load
window.initNavigation = function () {
    console.log("[Navigation] Initializing focus...");
    let $focusable = $('.focusable');
    if ($focusable.length > 0) {
        $focusable.first().addClass('focused').focus();
    } else {
        console.warn("[Navigation] No focusable elements found on init");
    }
};

$(document).ready(function () {
    // Only bind keys once
    bindKeys();
});

function bindKeys() {
    $(document).off('keydown').on('keydown', function (e) {
        // Handle Input Typing Mode
        if ($(e.target).is('input')) {
            // We are natively focused on an input (typing mode)
            // Allow default typing and cursor movement
            if (e.keyCode === KEY.RETURN) {
                // Exit typing mode on Back/Return
                e.target.blur();
                // Don't propagate to App.handleBack() immediately, just blur first
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.keyCode === KEY.ENTER) {
                // Determine behavior on Enter while typing? 
                // Usually closes keyboard or submits. Let's blur to be safe/consistent.
                e.target.blur();
                e.preventDefault();
                return;
            }
            // Allow arrows (left/right) for cursor, but maybe Up/Down to navigate away?
            // For now, let's keep it simple: if focused, you are trapped until you Blur (Back/Enter)
            // Or allow Up/Down to blur and navigate?
            if (e.keyCode === KEY.UP || e.keyCode === KEY.DOWN) {
                e.target.blur();
                // Fallthrough to navigation logic below
            } else {
                return; // Allow native key (letters, numbers, left/right)
            }
        }

        const code = e.keyCode;
        const $current = $('.focused');
        let $next = null;

        //console.log("Key pressed:", code);

        switch (code) {
            case KEY.LEFT:
                $next = findClosest($current, 'left');
                break;
            case KEY.RIGHT:
                $next = findClosest($current, 'right');
                break;
            case KEY.UP:
                $next = findClosest($current, 'up');
                break;
            case KEY.DOWN:
                $next = findClosest($current, 'down');
                break;
            case KEY.ENTER:
                if ($current.is('input')) {
                    // User wants to edit this input. Focus it natively.
                    $current.focus();
                } else {
                    $current.trigger('click');
                    e.preventDefault(); // Prevent double-fire if browser also fires click
                    e.stopPropagation();
                }
                break;
            case KEY.RETURN:
                console.log("Return/Back key pressed");
                if (window.App && window.App.handleBack) {
                    window.App.handleBack();
                }
                break;
            case KEY.CH_UP:
                if (window.App && window.App.state === "PLAYER") {
                    window.App.nextChannel();
                }
                break;
            case KEY.CH_DOWN:
                if (window.App && window.App.state === "PLAYER") {
                    window.App.prevChannel();
                }
                break;
            case KEY.PLAY:
                console.log("Play key pressed");
                break;
            default:
                // Auto-enter edit mode if typing alphanumeric characters on a highlighted input
                if ($current.is('input') && e.key && e.key.length === 1) {
                    console.log("Auto-focusing input on typing...");
                    $current.focus();
                    // We do NOT prevent default, hoping the char makes it to the input
                    // or at least invokes the VKB.
                }
                break;
        }

        if ($next && $next.length > 0) {
            $('.focused').removeClass('focused');
            $next.addClass('focused');

            // Logic: Only focus natively if NOT an input (to avoid Keyboard popup)
            if ($next.is('input')) {
                // Ensure we are blurred (in case we moved from another input directly?)
                if (document.activeElement) document.activeElement.blur();
            } else {
                $next.focus();
            }

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
            up: { prop: 'top', func: (rect, curr) => rect.bottom <= curr.top + 5 }, // 5px fuzziness 
            down: { prop: 'top', func: (rect, curr) => rect.top >= curr.bottom - 5 },
            left: { prop: 'left', func: (rect, curr) => rect.right <= curr.left + 5 },
            right: { prop: 'left', func: (rect, curr) => rect.left >= curr.right - 5 }
        };

        if ($current.length === 0) return $();

        const currentRect = $current[0].getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let $best = $();
        let bestDist = Infinity;

        $('.focusable').each(function () {
            if (this === $current[0]) return;

            // Skip hidden elements (simple check)
            if ($(this).is(':hidden') || $(this).css('visibility') === 'hidden') return;

            const rect = this.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            // Direction Check: MUST be strictly in the direction valid
            // Used improved logic:
            let isValid = false;

            if (direction === 'up' && rect.bottom <= currentRect.top + 10) isValid = true;
            if (direction === 'down' && rect.top >= currentRect.bottom - 10) isValid = true;
            if (direction === 'left' && rect.right <= currentRect.left + 10) isValid = true;
            if (direction === 'right' && rect.left >= currentRect.right - 10) isValid = true;

            if (!isValid) return;

            // Distance Calculation (Euclidean)
            // Weight the primary axis less than the secondary axis to favor "straight" lines?
            // Simple Euclidean is usually fine for grids.
            const dist = Math.sqrt(
                Math.pow(center.x - currentCenter.x, 2) +
                Math.pow(center.y - currentCenter.y, 2)
            );

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
};
