// Lightweight 3D tilt effect — no dependencies.
// Add class="tilt-3d" to any card and it will tilt toward the cursor
// with a subtle parallax lift, then ease back to flat on mouse-leave.
(function () {
  const MAX_TILT = 8; // degrees
  const cards = document.querySelectorAll('.tilt-3d');
  if (!cards.length) return;

  cards.forEach((card) => {
    card.style.position = card.style.position || 'relative';

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const px = x / rect.width - 0.5;
      const py = y / rect.height - 0.5;

      const rotateY = px * MAX_TILT * 2;
      const rotateX = -py * MAX_TILT * 2;

      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;

      // Move the glossy highlight toward the cursor.
      card.style.setProperty('--tilt-x', `${(px + 0.5) * 100}%`);
      card.style.setProperty('--tilt-y', `${(py + 0.5) * 100}%`);
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });
})();
