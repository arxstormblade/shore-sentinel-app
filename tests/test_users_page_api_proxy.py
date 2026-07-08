import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


class UsersPageApiProxyTests(unittest.TestCase):
    def test_users_client_uses_mounted_next_api_proxy(self):
        users_api = read('web/lib/users-api.js')
        self.assertIn("import { appPath } from '@/lib/paths';", users_api)
        self.assertIn("appPath('/api')", users_api)
        self.assertNotIn("'/shore-sentinel-api'", users_api)
        self.assertIn('fetch(`${apiBase()}/users/roles`', users_api)

    def test_users_proxy_routes_exist(self):
        required = [
            'web/app/api/users/route.js',
            'web/app/api/users/[...path]/route.js',
        ]
        for rel in required:
            self.assertTrue((ROOT / rel).exists(), f'missing {rel}')

    def test_users_proxy_forwards_auth_cookie_and_methods(self):
        route = read('web/app/api/users/[...path]/route.js') + read('web/app/api/users/route.js')
        self.assertIn('request.headers.get(\'cookie\')', route)
        self.assertIn('serverApiBase()', route)
        for method in ['GET', 'POST', 'PATCH', 'DELETE']:
            self.assertIn(f'export async function {method}', route)
        self.assertIn('context?.params?.path', route)
        self.assertIn('${serverApiBase()}/users${suffix}', route)


if __name__ == '__main__':
    unittest.main()
