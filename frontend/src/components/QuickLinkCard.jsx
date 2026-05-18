import React from 'react';

export default function QuickLinkCard({ href, title, description, icon = '↗' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="card p-6 text-left hover:shadow-md hover:border-primary-300 transition-all group block"
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 group-hover:text-primary-700">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </a>
  );
}
