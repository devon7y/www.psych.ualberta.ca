document.addEventListener('DOMContentLoaded', function() {
    const thetaWaves = document.querySelectorAll('.theta-wave');
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let targetX = mouseX;
    let targetY = mouseY;
    
    function getDistance(x, y, mouseX, mouseY) {
        return Math.sqrt(Math.pow(x - mouseX, 2) + Math.pow(y - mouseY, 2));
    }
    
    function updateWaveBrightness() {
        thetaWaves.forEach(wave => {
            const rect = wave.getBoundingClientRect();
            const waveCenterX = rect.left + rect.width / 2;
            const waveCenterY = rect.top + rect.height / 2;
            
            const distance = getDistance(waveCenterX, waveCenterY, mouseX, mouseY);
            const maxDistance = 400;
            
            let brightness = 0.3;
            if (distance < maxDistance) {
                const proximityFactor = 1 - (distance / maxDistance);
                brightness = 0.3 + (1.7 * proximityFactor);
            }
            
            wave.style.setProperty('--wave-brightness', brightness);
        });
    }
    
    document.addEventListener('mousemove', function(e) {
        targetX = e.clientX;
        targetY = e.clientY;
        document.body.classList.add('spotlight-active');
    });
    
    document.addEventListener('mouseleave', function() {
        document.body.classList.remove('spotlight-active');
    });
    
    function animate() {
        mouseX += (targetX - mouseX) * 0.1;
        mouseY += (targetY - mouseY) * 0.1;
        
        document.documentElement.style.setProperty('--mouse-x', mouseX + 'px');
        document.documentElement.style.setProperty('--mouse-y', mouseY + 'px');
        
        updateWaveBrightness();
        requestAnimationFrame(animate);
    }
    
    animate();
});