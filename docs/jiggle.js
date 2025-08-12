document.addEventListener('DOMContentLoaded', () => {
  const thetaBackground = document.getElementById('theta-background');

  if (thetaBackground) {
    document.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;

      const xPos = (clientX / innerWidth - 0.5) * 2;
      const yPos = (clientY / innerHeight - 0.5) * 2;

      const xOffset = xPos * 10;
      const yOffset = yPos * 10;

      thetaBackground.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    });
  }
});
