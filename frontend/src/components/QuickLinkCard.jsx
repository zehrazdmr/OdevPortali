import React from 'react';
import { Link } from 'react-router-dom';

export default function QuickLinkCard({ href, to, onClick, title, description, icon = '↗' }) {
  const sharedClassName = 'card p-6 text-left hover:shadow-md hover:border-primary-300 transition-all group block w-full appearance-none cursor-pointer';
  const content = (
    <>
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 group-hover:text-primary-700">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={sharedClassName}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={sharedClassName}>
        {content}
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={sharedClassName}
    >
      {content}
    </a>
  );
}
