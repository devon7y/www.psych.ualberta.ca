console.log("Scroll offset script loaded!");
document.addEventListener('DOMContentLoaded', () => {
    const fixedHeaderHeight = 70; // Assuming header height is consistently 70px

    // Function to scroll to a target element with an offset
    const scrollToElement = (elementId) => {
        const targetElement = document.getElementById(elementId);
        if (targetElement) {
            const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
            const offsetPosition = elementPosition - fixedHeaderHeight;

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    };

    // Handle clicks on anchor links within the same page
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault(); // Prevent default jump

            const targetId = this.getAttribute('href').substring(1);
            scrollToElement(targetId);

            // Update URL hash without triggering another scroll
            history.pushState(null, null, `#${targetId}`);
        });
    });

    // Handle direct navigation to a hash (e.g., from index.html or direct URL)
    // This will fire if the page loads with a hash in the URL
    if (window.location.hash) {
        // Use a timeout to ensure rendering is complete before scrolling
        // This can sometimes help with elements not being fully positioned yet
        setTimeout(() => {
            scrollToElement(window.location.hash.substring(1));
        }, 100); // Small delay
    }

    // Handle hash changes (e.g., back/forward button, or manual hash change)
    window.addEventListener('hashchange', () => {
        if (window.location.hash) {
            scrollToElement(window.location.hash.substring(1));
        }
    });
});
