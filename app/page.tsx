import { headers } from 'next/headers';
import { Providers } from './providers';
import Casino from './casino';

export default function Page() {
  const cookies = headers().get('cookie');
  return (
    <Providers cookies={cookies}>
      <Casino />
    </Providers>
  );
}
