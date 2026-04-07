'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

import Logo from '@/images/logo.png';

export default function Nav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-10 h-14 bg-white text-[#066DB7]">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-2 sm:px-16">
          <div className="flex items-center space-x-16">
            <div className="w-[6.5rem] sm:w-[7.25rem]">
              <Image src={Logo} alt="logo" priority quality={100} />
            </div>
            <nav className="flex space-x-16 text-sm font-bold max-sm:hidden">
              <Link href="#pharmacies">For Patients</Link>
              <Link href="#patients">For Providers</Link>
              
            </nav>
          </div>
          <button onClick={() => setIsOpen(true)} className="sm:hidden">
            <Bars3Icon className="size-6" />
            <span className="sr-only">Menu</span>
          </button>
        </div>
      </header>
      <aside className={`fixed inset-0 z-20 sm:hidden ${!isOpen ? 'invisible' : ''}`}>
        <div className="bg-white">
          <div className="flex items-center justify-between px-4 py-2 sm:px-16">
            <div className="flex items-center space-x-16">
              <div className="w-[6.5rem] sm:w-[7.25rem]">
                <Image src={Logo} alt="logo" priority quality={100} />
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="sm:hidden">
              <XMarkIcon className="size-6 text-[#066DB7]" />
              <span className="sr-only">Close Menu</span>
            </button>
          </div>
          <nav className="space-y-6 px-6 py-8 text-center text-lg/5 font-bold text-[#066DB7]">
            <div className="flex flex-col space-y-6">
              <Link href="#pharmacies" onClick={() => setIsOpen(false)}>
                For Patients
              </Link>
              <Link href="#patients" onClick={() => setIsOpen(false)}>
                For Providers
              </Link>
              <a href="https://www.ilarahealth.com/" target="_blank" rel="noopener">
                Ilara Health
              </a>
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}
